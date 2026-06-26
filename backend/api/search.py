import os
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId

from backend.retrieval.retrieval import retrieval_service
from backend.vision.service import vision_service
from backend.core.config import settings
from backend.database.mongo import db

router = APIRouter(prefix="/search", tags=["search"])
logger = logging.getLogger(__name__)

class SearchResultResponse(BaseModel):
    chunk_id: str
    text: str
    document_id: str
    document_name: str
    workspace_id: str
    page_number: int
    chunk_index: int
    source_type: str
    rrf_score: float

class ImageAnalysisResponse(BaseModel):
    analysis: str

@router.get("", response_model=List[SearchResultResponse])
async def search_documents(
    query: str = Query(..., min_length=1),
    workspace_id: Optional[str] = Query(None),
    top_k: int = Query(5, ge=1, le=20)
):
    """Executes a hybrid semantic and keyword search across documents.
    
    If workspace_id is provided, filters results to that workspace. Otherwise search is global.
    """
    try:
        # Run hybrid search
        results = await retrieval_service.hybrid_search(query, workspace_id, top_k=top_k)
        
        # Get document names
        doc_ids = list(set([r["document_id"] for r in results if r.get("document_id")]))
        doc_names_map = {}
        if doc_ids:
            cursor = db.documents_col.find({"_id": {"$in": doc_ids}})
            docs = await cursor.to_list(length=len(doc_ids))
            doc_names_map = {doc["_id"]: doc["name"] for doc in docs}

        formatted_results = []
        for r in results:
            doc_id = r["document_id"]
            doc_name = doc_names_map.get(doc_id, "Unknown Document")
            
            formatted_results.append(SearchResultResponse(
                chunk_id=r["chunk_id"],
                text=r["text"],
                document_id=doc_id,
                document_name=doc_name,
                workspace_id=r["workspace_id"],
                page_number=r["page_number"],
                chunk_index=r["chunk_index"],
                source_type=r["source_type"],
                rrf_score=r.get("rrf_score", 0.0)
            ))
            
        return formatted_results
    except Exception as e:
        logger.error(f"Search endpoint failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

@router.get("/advanced", response_model=List[SearchResultResponse])
async def advanced_search_documents(
    query: str = Query(..., min_length=1),
    workspace_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    top_k: int = Query(5, ge=1, le=20)
):
    """Executes a hybrid semantic and keyword search with advanced filters.
    
    Filters search results based on workspace, category, language, file type, and creation date ranges.
    """
    try:
        # Build document filter for metadata conditions
        doc_filter = {}
        if workspace_id:
            doc_filter["workspace_id"] = workspace_id
        if category:
            doc_filter["category"] = category
        if language:
            doc_filter["language"] = language
        if file_type:
            doc_filter["type"] = file_type
            
        # Date range filters on created_at (format: ISO YYYY-MM-DDThh:mm:ss)
        if start_date or end_date:
            date_filter = {}
            if start_date:
                if len(start_date) == 10:
                    start_date = f"{start_date}T00:00:00"
                date_filter["$gte"] = start_date
            if end_date:
                if len(end_date) == 10:
                    end_date = f"{end_date}T23:59:59"
                date_filter["$lte"] = end_date
            doc_filter["created_at"] = date_filter

        filter_applied = any([category, language, file_type, start_date, end_date])
        document_ids = None
        
        if filter_applied:
            # Query documents that match filters first
            cursor = db.documents_col.find(doc_filter, {"_id": 1})
            matching_docs = await cursor.to_list(length=10000)
            document_ids = [str(d["_id"]) for d in matching_docs]
            if not document_ids:
                return []  # Return empty if no documents match metadata filters

        # Run hybrid search restricted by matching document IDs
        results = await retrieval_service.hybrid_search(
            query=query,
            workspace_id=workspace_id,
            top_k=top_k,
            document_ids=document_ids
        )
        
        # Get document names
        doc_ids = list(set([r["document_id"] for r in results if r.get("document_id")]))
        doc_names_map = {}
        if doc_ids:
            cursor = db.documents_col.find({"_id": {"$in": doc_ids}})
            docs = await cursor.to_list(length=len(doc_ids))
            doc_names_map = {doc["_id"]: doc["name"] for doc in docs}

        formatted_results = []
        for r in results:
            doc_id = r["document_id"]
            doc_name = doc_names_map.get(doc_id, "Unknown Document")
            
            formatted_results.append(SearchResultResponse(
                chunk_id=r["chunk_id"],
                text=r["text"],
                document_id=doc_id,
                document_name=doc_name,
                workspace_id=r["workspace_id"],
                page_number=r["page_number"],
                chunk_index=r["chunk_index"],
                source_type=r["source_type"],
                rrf_score=r.get("rrf_score", 0.0)
            ))
            
        return formatted_results
    except Exception as e:
        logger.error(f"Advanced search endpoint failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Advanced search failed: {e}")

@router.post("/image", response_model=ImageAnalysisResponse)
async def analyze_image_intelligence(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None)
):
    """Analyzes an uploaded image (screenshot, chart, table, invoice) using the local Qwen2.5-VL model."""
    temp_img_dir = os.path.join(settings.TEMP_DIR, "vision_uploads")
    os.makedirs(temp_img_dir, exist_ok=True)
    
    temp_path = None
    try:
        temp_id = str(ObjectId())
        file_ext = file.filename.split(".")[-1] if "." in file.filename else "png"
        temp_path = os.path.join(temp_img_dir, f"{temp_id}.{file_ext}")

        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
            
        # Select prompt
        default_prompt = (
            "Analyze this image in detail. Extract any readable text, explain charts or tables if present, "
            "and summarize its key information."
        )
        query_prompt = prompt if prompt else default_prompt
        
        # Analyze using local Qwen2.5-VL
        analysis_result = await vision_service.analyze_image(temp_path, query_prompt)
        
        return ImageAnalysisResponse(analysis=analysis_result)
        
    except Exception as e:
        logger.error(f"Image intelligence endpoint failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {e}")
        
    finally:
        # Cleanup temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
