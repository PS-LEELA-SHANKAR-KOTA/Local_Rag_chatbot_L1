import os
import shutil
import httpx
from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from backend.core.config import settings
from backend.database.mongo import db
from backend.database.chroma import chroma_db

router = APIRouter(prefix="/status", tags=["system-status"])

def get_dir_size(path: str) -> int:
    """Calculates total size of a directory in bytes."""
    total = 0
    if not os.path.exists(path):
        return 0
    for entry in os.scandir(path):
        if entry.is_file():
            total += entry.stat().st_size
        elif entry.is_dir():
            total += get_dir_size(entry.path)
    return total

@router.get("")
async def get_system_status() -> Dict[str, Any]:
    """Retrieve database, model, storage, and workspace statistics for the dashboard."""
    status = {
        "ollama": {"status": "disconnected", "models": [], "llama": False, "embedding": False, "vision": False},
        "mongodb": {"status": "disconnected", "documents_count": 0, "workspaces_count": 0, "messages_count": 0},
        "chromadb": {"status": "disconnected", "vector_count": 0},
        "storage": {"total_bytes": 0, "free_bytes": 0, "uploads_size_bytes": 0},
    }

    # 1. Check Ollama
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            response = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                status["ollama"]["status"] = "connected"
                status["ollama"]["models"] = models
                status["ollama"]["llama"] = any(settings.LLM_MODEL in m for m in models) or any("llama3.2" in m for m in models)
                status["ollama"]["embedding"] = any(settings.EMBEDDING_MODEL in m for m in models) or any("mxbai" in m for m in models)
                status["ollama"]["vision"] = any(settings.VISION_MODEL in m for m in models) or any("qwen2.5vl" in m for m in models)
        except Exception:
            # Keep disconnected defaults
            pass

    # 2. Check MongoDB
    try:
        # Check connection by running ping command or counting
        if db.db is not None:
            docs_count = await db.documents_col.count_documents({})
            workspaces_count = await db.workspaces_col.count_documents({})
            messages_count = await db.messages_col.count_documents({})
            
            status["mongodb"]["status"] = "connected"
            status["mongodb"]["documents_count"] = docs_count
            status["mongodb"]["workspaces_count"] = workspaces_count
            status["mongodb"]["messages_count"] = messages_count
    except Exception:
        pass

    # 3. Check ChromaDB
    try:
        collection = chroma_db.get_chunks_collection()
        vector_count = collection.count()
        status["chromadb"]["status"] = "connected"
        status["chromadb"]["vector_count"] = vector_count
    except Exception:
        pass

    # 4. Check Storage
    try:
        # Disk stats of workspace drive
        path_to_check = settings.UPLOAD_DIR
        total, used, free = shutil.disk_usage(path_to_check)
        status["storage"]["total_bytes"] = total
        status["storage"]["free_bytes"] = free
        status["storage"]["uploads_size_bytes"] = get_dir_size(settings.UPLOAD_DIR)
    except Exception:
        pass

    return status
