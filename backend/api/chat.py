import json
import logging
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from bson import ObjectId

from backend.database.mongo import db
from backend.rag.rag import rag_service

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

class ConversationCreate(BaseModel):
    workspace_id: str
    title: str = Field(default="New Chat")

class ConversationResponse(BaseModel):
    id: str
    workspace_id: str
    title: str
    created_at: str
    updated_at: str

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: Optional[List[Dict[str, Any]]] = None
    confidence_score: Optional[int] = None
    follow_up_questions: Optional[List[str]] = None
    created_at: str

def serialize_conversation(doc: dict) -> ConversationResponse:
    return ConversationResponse(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        title=doc["title"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )

def serialize_message(doc: dict) -> MessageResponse:
    # Handle mongo timestamps
    created_at_str = doc["created_at"].isoformat() if hasattr(doc["created_at"], "isoformat") else str(doc["created_at"])
    return MessageResponse(
        id=str(doc["_id"]),
        conversation_id=doc["conversation_id"],
        role=doc["role"],
        content=doc["content"],
        citations=doc.get("citations"),
        confidence_score=doc.get("confidence_score"),
        follow_up_questions=doc.get("follow_up_questions"),
        created_at=created_at_str
    )

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(chat_in: ConversationCreate):
    """Starts a new chat session in a workspace."""
    workspace = await db.workspaces_col.find_one({"_id": chat_in.workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    conv_id = str(ObjectId())
    timestamp = ObjectId(conv_id).get_generation_time().isoformat()
    
    conv_doc = {
        "_id": conv_id,
        "workspace_id": chat_in.workspace_id,
        "title": chat_in.title,
        "created_at": timestamp,
        "updated_at": timestamp
    }
    
    await db.conversations_col.insert_one(conv_doc)
    return serialize_conversation(conv_doc)

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(workspace_id: str = Query(..., description="The ID of the workspace")):
    """Lists conversation histories for a specific workspace."""
    cursor = db.conversations_col.find({"workspace_id": workspace_id}).sort("updated_at", -1)
    conversations = await cursor.to_list(length=100)
    return [serialize_conversation(c) for c in conversations]

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(conversation_id: str):
    """Gets all historical messages for a specific conversation session."""
    conv = await db.conversations_col.find_one({"_id": conversation_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    cursor = db.messages_col.find({"conversation_id": conversation_id}).sort("created_at", 1)
    messages = await cursor.to_list(length=200)
    return [serialize_message(m) for m in messages]

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Deletes a conversation session and all its messages from history."""
    conv = await db.conversations_col.find_one({"_id": conversation_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # Delete messages
    await db.messages_col.delete_many({"conversation_id": conversation_id})
    # Delete conversation
    await db.conversations_col.delete_one({"_id": conversation_id})
    return {"message": f"Conversation {conversation_id} and all messages deleted."}

@router.delete("/messages/{message_id}")
async def delete_message(message_id: str):
    """Deletes a single message by ID."""
    # Delete by string ID first, then by ObjectId if necessary
    res = await db.messages_col.delete_one({"_id": message_id})
    if res.deleted_count == 0:
        try:
            res_obj = await db.messages_col.delete_one({"_id": ObjectId(message_id)})
            if res_obj.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Message not found")
        except Exception:
            raise HTTPException(status_code=404, detail="Message not found or invalid format")
    return {"message": f"Message {message_id} deleted successfully."}

@router.get("/conversations/{conversation_id}/stream")
async def stream_rag_response(
    conversation_id: str,
    query: str = Query(..., min_length=1)
):
    """Streams RAG generation using Server-Sent Events (SSE) based on document context."""
    conv = await db.conversations_col.find_one({"_id": conversation_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation session not found")
        
    workspace_id = conv["workspace_id"]
    
    # Check if there are any indexed files in this workspace
    # If not, we can warn the user or continue with LLM general knowledge
    files_count = await db.documents_col.count_documents({
        "workspace_id": workspace_id, 
        "indexing_status": "completed"
    })
    
    if files_count == 0:
        logger.warning(f"No indexed files found in workspace {workspace_id}. Chat will run in general knowledge mode.")

    return StreamingResponse(
        rag_service.generate_response(query, workspace_id, conversation_id),
        media_type="text/event-stream"
    )
