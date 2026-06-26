import os
import shutil
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from bson import ObjectId

from backend.database.mongo import db
from backend.database.chroma import chroma_db
from backend.core.config import settings

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="")

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: str

class WorkspaceRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

def serialize_mongo_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert MongoDB object IDs to strings."""
    if not doc:
        return doc
    doc_copy = dict(doc)
    doc_copy["id"] = str(doc_copy.pop("_id"))
    return doc_copy

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces():
    """List all available workspaces."""
    cursor = db.workspaces_col.find().sort("name", 1)
    workspaces = await cursor.to_list(length=100)
    return [serialize_mongo_doc(w) for w in workspaces]

@router.post("", response_model=WorkspaceResponse)
async def create_workspace(workspace_in: WorkspaceCreate):
    """Create a new isolated workspace."""
    # Check if name already exists
    existing = await db.workspaces_col.find_one({"name": workspace_in.name})
    if existing:
        raise HTTPException(status_code=400, detail=f"Workspace with name '{workspace_in.name}' already exists.")

    new_id = str(ObjectId())
    timestamp = ObjectId(new_id).get_generation_time().isoformat()
    
    workspace_doc = {
        "_id": new_id,
        "name": workspace_in.name,
        "description": workspace_in.description,
        "created_at": timestamp
    }
    
    await db.workspaces_col.insert_one(workspace_doc)
    return serialize_mongo_doc(workspace_doc)

@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def rename_workspace(workspace_id: str, payload: WorkspaceRename):
    """Rename a workspace's display name and/or description."""
    workspace = await db.workspaces_col.find_one({"_id": workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    existing = await db.workspaces_col.find_one({"name": payload.name, "_id": {"$ne": workspace_id}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Workspace with name '{payload.name}' already exists.")

    update_fields = {"name": payload.name}
    if payload.description is not None:
        update_fields["description"] = payload.description

    await db.workspaces_col.update_one(
        {"_id": workspace_id},
        {"$set": update_fields}
    )

    updated_doc = await db.workspaces_col.find_one({"_id": workspace_id})
    return serialize_mongo_doc(updated_doc)

@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: str):
    """Get details of a specific workspace."""
    workspace = await db.workspaces_col.find_one({"_id": workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return serialize_mongo_doc(workspace)

@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str):
    """Deletes a workspace, all its documents, chat history, and vector embeddings."""
    workspace = await db.workspaces_col.find_one({"_id": workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # 1. Get all documents in this workspace to delete their files
    doc_cursor = db.documents_col.find({"workspace_id": workspace_id})
    async for doc in doc_cursor:
        file_path = doc.get("path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    # 3. Delete document records in MongoDB
    await db.documents_col.delete_many({"workspace_id": workspace_id})
    
    # 4. Delete chunks in MongoDB
    await db.db["chunks"].delete_many({"workspace_id": workspace_id})

    # 5. Delete chunks in ChromaDB
    try:
        chroma_db.delete_workspace_chunks(workspace_id)
    except Exception as e:
        # ChromaDB delete can fail if collection has no items yet
        pass

    # 6. Delete conversations and messages associated with the workspace
    conv_cursor = db.conversations_col.find({"workspace_id": workspace_id})
    async for conv in conv_cursor:
        await db.messages_col.delete_many({"conversation_id": conv["_id"]})
        
    await db.conversations_col.delete_many({"workspace_id": workspace_id})

    # 7. Delete the workspace itself
    await db.workspaces_col.delete_one({"_id": workspace_id})

    return {"message": f"Workspace {workspace_id} and all related data deleted successfully."}
