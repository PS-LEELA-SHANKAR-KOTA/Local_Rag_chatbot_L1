import os
import logging
import shutil
import asyncio
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId

from backend.database.mongo import db
from backend.database.chroma import chroma_db
from backend.core.config import settings
from backend.indexing.indexer import index_document_in_background

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

class DocumentResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    type: str
    size: int
    ocr_status: str
    indexing_status: str
    num_chunks: int
    created_at: str
    author: Optional[str] = "Unknown"
    creation_date: Optional[str] = "Unknown"
    modified_date: Optional[str] = "Unknown"
    page_count: Optional[int] = 0
    language: Optional[str] = "English"
    category: Optional[str] = "General Document"
    keywords: Optional[List[str]] = []
    topics: Optional[List[str]] = []
    processing_time: Optional[float] = 0.0
    error_message: Optional[str] = None

class RenameDocumentRequest(BaseModel):
    name: str

class MoveDocumentRequest(BaseModel):
    workspace_id: str

class PagePreview(BaseModel):
    page_number: int
    text: str

class DocumentPreviewResponse(BaseModel):
    document_id: str
    document_name: str
    pages: List[PagePreview]

class OCRTextResponse(BaseModel):
    document_id: str
    document_name: str
    ocr_text: str

def serialize_document(doc: dict) -> DocumentResponse:
    return DocumentResponse(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        name=doc["name"],
        type=doc["type"],
        size=doc["size"],
        ocr_status=doc.get("ocr_status", "not_needed"),
        indexing_status=doc.get("indexing_status", "pending"),
        num_chunks=doc.get("num_chunks", 0),
        created_at=doc.get("created_at", "Unknown"),
        author=doc.get("author", "Unknown"),
        creation_date=doc.get("creation_date", "Unknown"),
        modified_date=doc.get("modified_date", "Unknown"),
        page_count=doc.get("page_count", 0),
        language=doc.get("language", "English"),
        category=doc.get("category", "General Document"),
        keywords=doc.get("keywords", []),
        topics=doc.get("topics", []),
        processing_time=doc.get("processing_time", 0.0),
        error_message=doc.get("error_message")
    )

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt", "md", "csv", "xlsx", "pptx", "png", "jpg", "jpeg", "json", "html"}

@router.post("/upload", response_model=DocumentResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    workspace_id: str = Form(...)
):
    """Uploads a file to a workspace and triggers background parsing & vector indexing."""
    # Validate workspace
    workspace = await db.workspaces_col.find_one({"_id": workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Validate file extension
    file_ext = os.path.splitext(file.filename)[1].lstrip(".").lower() if file.filename else "txt"
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"File type '.{file_ext}' is not supported.")

    # Generate file ID and paths
    doc_id = str(ObjectId())
    safe_filename = f"{doc_id}.{file_ext}"
    
    workspace_upload_dir = os.path.join(settings.UPLOAD_DIR, workspace_id)
    os.makedirs(workspace_upload_dir, exist_ok=True)
    
    file_path = os.path.join(workspace_upload_dir, safe_filename)
    
    # Save file to disk using streaming to prevent RAM exhaustion
    file_size = 0
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # Read in 1MB chunks
                file_size += len(chunk)
                if file_size > MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(status_code=413, detail=f"File size exceeds limit of 50MB")
                f.write(chunk)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to save upload on disk: {e}")

    # Register document metadata in MongoDB
    timestamp = ObjectId(doc_id).generation_time.isoformat()
    doc_metadata = {
        "_id": doc_id,
        "workspace_id": workspace_id,
        "name": file.filename,
        "type": file_ext,
        "size": file_size,
        "path": file_path,
        "ocr_status": "pending",
        "indexing_status": "pending",
        "num_chunks": 0,
        "created_at": timestamp
    }
    
    await db.documents_col.insert_one(doc_metadata)

    # Queue background indexing task (FIX: document_id instead of doc_id keyword argument)
    background_tasks.add_task(
        index_document_in_background,
        document_id=doc_id,
        file_path=file_path,
        file_type=file_ext,
        workspace_id=workspace_id
    )

    return serialize_document(doc_metadata)

@router.get("", response_model=List[DocumentResponse])
async def list_files(workspace_id: Optional[str] = None):
    """Lists files in the entire application or filters by a specific workspace."""
    query = {}
    if workspace_id:
        query["workspace_id"] = workspace_id
        
    cursor = db.documents_col.find(query).sort("created_at", -1)
    documents = await cursor.to_list(length=1000)
    return [serialize_document(d) for d in documents]

@router.get("/{file_id}", response_model=DocumentResponse)
async def get_file_metadata(file_id: str):
    """Retrieve metadata details for a specific document."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    return serialize_document(doc)

@router.get("/{file_id}/download")
async def download_file(file_id: str):
    """Serves the raw file content for download or local UI rendering/previewing."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc or not doc.get("path") or not os.path.exists(doc["path"]):
        raise HTTPException(status_code=404, detail="File content not found on disk")
        
    # Serve file with its original upload filename
    return FileResponse(
        path=doc["path"],
        filename=doc["name"],
        media_type="application/octet-stream"
    )

@router.delete("/{file_id}")
async def delete_file(file_id: str):
    """Deletes a file from disk, MongoDB metadata, and ChromaDB vector collections."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    # 1. Delete file on disk
    file_path = doc.get("path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    # 2. Delete database metadata
    await db.documents_col.delete_one({"_id": file_id})
    await db.db["chunks"].delete_many({"document_id": file_id})

    # 3. Delete vector embeddings in ChromaDB
    try:
        chroma_db.delete_document_chunks(file_id)
    except Exception:
        pass

    return {"message": f"File {file_id} and all indexed data deleted successfully."}

@router.post("/{file_id}/reindex", response_model=DocumentResponse)
async def reindex_file(file_id: str, background_tasks: BackgroundTasks):
    """Triggers complete re-parsing and re-indexing of a document."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    # 1. Clear existing chunks in MongoDB and ChromaDB
    await db.db["chunks"].delete_many({"document_id": file_id})
    try:
        chroma_db.delete_document_chunks(file_id)
    except Exception as e:
        logger.warning(f"Failed to clear chroma chunks for reindexing: {e}")

    # 2. Reset status in MongoDB
    await db.documents_col.update_one(
        {"_id": file_id},
        {
            "$set": {
                "indexing_status": "pending",
                "index_status": "pending",
                "ocr_status": "pending",
                "num_chunks": 0
            }
        }
    )

    # 3. Trigger indexing background task
    background_tasks.add_task(
        index_document_in_background,
        document_id=file_id,
        file_path=doc["path"],
        file_type=doc["type"],
        workspace_id=doc["workspace_id"]
    )

    # Fetch updated doc
    updated_doc = await db.documents_col.find_one({"_id": file_id})
    return serialize_document(updated_doc)

@router.patch("/{file_id}", response_model=DocumentResponse)
async def rename_file(file_id: str, payload: RenameDocumentRequest):
    """Updates the display name of a file."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    await db.documents_col.update_one(
        {"_id": file_id},
        {"$set": {"name": payload.name}}
    )

    updated_doc = await db.documents_col.find_one({"_id": file_id})
    return serialize_document(updated_doc)

@router.patch("/{file_id}/move", response_model=DocumentResponse)
async def move_file(file_id: str, payload: MoveDocumentRequest):
    """Moves a file to a different workspace, relocating its file on disk and updating databases."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    new_workspace_id = payload.workspace_id
    workspace = await db.workspaces_col.find_one({"_id": new_workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Target workspace not found")

    old_path = doc.get("path")
    if not old_path or not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File source content not found on disk")

    # Relocate file on disk
    new_dir = os.path.join(settings.UPLOAD_DIR, new_workspace_id)
    os.makedirs(new_dir, exist_ok=True)
    
    file_name = os.path.basename(old_path)
    new_path = os.path.join(new_dir, file_name)

    try:
        shutil.move(old_path, new_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to relocate file on disk: {e}")

    # Update document in MongoDB
    await db.documents_col.update_one(
        {"_id": file_id},
        {"$set": {"workspace_id": new_workspace_id, "path": new_path}}
    )

    # Update all chunks in MongoDB chunks collection
    await db.db["chunks"].update_many(
        {"document_id": file_id},
        {"$set": {"workspace_id": new_workspace_id}}
    )

    # Update ChromaDB metadatas
    try:
        chunks = await db.db["chunks"].find({"document_id": file_id}).to_list(length=10000)
        if chunks:
            chunk_ids = [c["_id"] for c in chunks]
            collection = chroma_db.get_chunks_collection()
            
            loop = asyncio.get_running_loop()
            
            new_metadatas = []
            for c in chunks:
                new_metadatas.append({
                    "document_id": file_id,
                    "workspace_id": new_workspace_id,
                    "page_number": c["page_number"],
                    "chunk_index": c["chunk_index"],
                    "section": c.get("section", "General Context"),
                    "hash": c.get("hash", ""),
                    "source_type": c.get("metadata", {}).get("source_type", doc.get("type", "unknown"))
                })
                
            await loop.run_in_executor(
                None,
                lambda: collection.update(ids=chunk_ids, metadatas=new_metadatas)
            )
    except Exception as e:
        logger.warning(f"Failed to update workspace_id in ChromaDB chunks metadata: {e}")

    updated_doc = await db.documents_col.find_one({"_id": file_id})
    return serialize_document(updated_doc)

@router.get("/{file_id}/preview", response_model=DocumentPreviewResponse)
async def preview_file(file_id: str):
    """Returns parsed text contents grouped by pages for UI inspection."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    # Fetch all chunks for this document
    chunks = await db.db["chunks"].find({"document_id": file_id}).sort("chunk_index", 1).to_list(length=10000)
    
    # Group by page number
    pages_map = {}
    for c in chunks:
        page_num = c.get("page_number", 1)
        text = c.get("text", "")
        # Strip prepended section header if present to show raw layout text
        if text.startswith("Section:"):
            parts = text.split("\n", 1)
            if len(parts) > 1:
                text = parts[1].strip()
        
        if page_num not in pages_map:
            pages_map[page_num] = []
        pages_map[page_num].append(text)

    pages = []
    for page_num in sorted(pages_map.keys()):
        pages.append(PagePreview(
            page_number=page_num,
            text="\n\n".join(pages_map[page_num])
        ))

    return DocumentPreviewResponse(
        document_id=file_id,
        document_name=doc["name"],
        pages=pages
    )

@router.get("/{file_id}/ocr-text", response_model=OCRTextResponse)
async def get_file_ocr_text(file_id: str):
    """Retrieve full text contents (concatenated chunks text) extracted from the file."""
    doc = await db.documents_col.find_one({"_id": file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    chunks = await db.db["chunks"].find({"document_id": file_id}).sort("chunk_index", 1).to_list(length=10000)
    
    full_texts = []
    for c in chunks:
        text = c.get("text", "")
        if text.startswith("Section:"):
            parts = text.split("\n", 1)
            if len(parts) > 1:
                text = parts[1].strip()
        full_texts.append(text)
        
    return OCRTextResponse(
        document_id=file_id,
        document_name=doc["name"],
        ocr_text="\n\n".join(full_texts)
    )
