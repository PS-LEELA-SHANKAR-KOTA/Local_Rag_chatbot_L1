import logging
import asyncio
import hashlib
import time
import re
from typing import List, Dict, Any
from backend.core.config import settings
from backend.database.mongo import db
from backend.database.chroma import chroma_db
from backend.parsers.parsers import document_parser
from backend.embeddings.service import embedding_service

logger = logging.getLogger(__name__)

def semantic_layout_chunker(text: str, chunk_size_chars: int = 2400, overlap_chars: int = 500) -> List[Dict[str, Any]]:
    """Splits text semantically based on Markdown headings and paragraph structures.
    
    Prepends heading context to every chunk to preserve semantic context.
    Avoids splitting code blocks, tables, or lists across chunk boundaries.
    """
    if not text:
        return []

    # Markdown heading split regex
    heading_pattern = re.compile(r"^(#{1,6}\s+.*)$", re.MULTILINE)
    parts = heading_pattern.split(text)
    
    sections = []
    current_heading = "General Context"
    
    if parts[0].strip():
        sections.append((current_heading, parts[0]))
        
    for i in range(1, len(parts), 2):
        current_heading = parts[i].strip()
        content = parts[i+1] if i+1 < len(parts) else ""
        sections.append((current_heading, content))
        
    chunks = []
    
    for heading, content in sections:
        # Split section content into paragraphs / atomic layout blocks
        # This keeps tables (using |) and lists (starting with -/*) grouped together
        elements = []
        raw_elements = content.split("\n\n")
        
        for elem in raw_elements:
            elem = elem.strip()
            if elem:
                elements.append(elem)
                
        current_chunk = []
        current_len = 0
        
        for elem in elements:
            elem_len = len(elem)
            header_context = f"Section: {heading}\n"
            
            # If the element itself is larger than the chunk size, split it character-wise
            if elem_len > chunk_size_chars:
                if current_chunk:
                    chunks.append({
                        "text": header_context + "\n\n".join(current_chunk),
                        "section": heading
                    })
                    current_chunk = []
                    current_len = 0
                
                step = chunk_size_chars - overlap_chars
                if step <= 0: step = chunk_size_chars
                for i in range(0, elem_len, step):
                    chunks.append({
                        "text": header_context + elem[i:i+chunk_size_chars],
                        "section": heading
                    })
                continue
            
            # If adding this element exceeds character limit, wrap current chunk
            if current_len + elem_len > chunk_size_chars:
                if current_chunk:
                    chunk_content = "\n\n".join(current_chunk)
                    chunks.append({
                        "text": header_context + chunk_content,
                        "section": heading
                    })
                
                # Create overlap of elements from the end
                overlap_elements = []
                overlap_len = 0
                for prev_elem in reversed(current_chunk):
                    if overlap_len + len(prev_elem) <= overlap_chars:
                        overlap_elements.insert(0, prev_elem)
                        overlap_len += len(prev_elem)
                    else:
                        break
                current_chunk = overlap_elements + [elem]
                current_len = overlap_len + elem_len
            else:
                current_chunk.append(elem)
                current_len += elem_len
                
        if current_chunk:
            header_context = f"Section: {heading}\n"
            chunks.append({
                "text": header_context + "\n\n".join(current_chunk),
                "section": heading
            })
            
    return chunks

def get_chunk_hash(text: str) -> str:
    """Generates an MD5 hash of text to verify chunk duplicates."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()

async def index_document_in_background(document_id: str, file_path: str, file_type: str, workspace_id: str):
    """Offline background task to parse, chunk, embed, and index a document.
    
    Bypasses vector embedding calls if a chunk hash match exists in the databases.
    """
    logger.info(f"Starting advanced background indexing for document: {document_id}")
    start_time = time.time()
    try:
        # 1. Update status to 'processing'
        await db.documents_col.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "indexing_status": "processing",
                    "index_status": "processing",
                    "ocr_status": "not_needed"
                }
            }
        )

        # 2. Parse the document (triggers internal OCR if scanned image)
        if file_type.lower() in ["png", "jpg", "jpeg", "webp", "tiff", "bmp"]:
            await db.documents_col.update_one(
                {"_id": document_id},
                {"$set": {"ocr_status": "processing"}}
            )

        loop = asyncio.get_running_loop()
        parsed_result = await loop.run_in_executor(None, document_parser.parse, file_path, file_type)
        
        pages = parsed_result["pages"]
        doc_metadata = parsed_result["metadata"]

        if file_type.lower() in ["png", "jpg", "jpeg", "webp", "tiff", "bmp"]:
            await db.documents_col.update_one(
                {"_id": document_id},
                {"$set": {"ocr_status": "completed"}}
            )

        # Update parsed document metadata properties in MongoDB
        await db.documents_col.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "author": doc_metadata.get("author", "Unknown"),
                    "creation_date": doc_metadata.get("creation_date", "Unknown"),
                    "modified_date": doc_metadata.get("modified_date", "Unknown"),
                    "page_count": doc_metadata.get("page_count", len(pages)),
                    "language": doc_metadata.get("language", "English"),
                    "category": doc_metadata.get("category", "General Document"),
                    "keywords": doc_metadata.get("keywords", []),
                    "topics": doc_metadata.get("topics", []),
                    "vision_status": "completed" if file_type.lower() in ["png", "jpg", "jpeg", "webp", "tiff", "bmp"] else "not_needed"
                }
            }
        )

        # 3. Perform Semantic layout chunking
        chunks_to_index = []
        chunk_idx = 0
        
        for page in pages:
            text = page["text"]
            page_num = page["page_number"]
            source_metadata = page["metadata"]
            
            # Apply semantic split
            split_chunks = semantic_layout_chunker(text, chunk_size_chars=2400, overlap_chars=500)
            
            for c in split_chunks:
                chunk_text = c["text"]
                if not chunk_text.strip():
                    continue
                    
                chunk_hash = get_chunk_hash(chunk_text)
                
                chunks_to_index.append({
                    "id": f"{document_id}_{chunk_idx}",
                    "text": chunk_text,
                    "page_number": page_num,
                    "chunk_index": chunk_idx,
                    "section": c["section"],
                    "hash": chunk_hash,
                    "metadata": source_metadata
                })
                chunk_idx += 1

        if not chunks_to_index:
            logger.warning(f"No semantic text chunks extracted from: {document_id}")
            await db.documents_col.update_one(
                {"_id": document_id},
                {
                    "$set": {
                        "indexing_status": "completed",
                        "index_status": "completed",
                        "embedding_status": "completed",
                        "num_chunks": 0,
                        "processing_time": time.time() - start_time
                    }
                }
            )
            return

        # 4. Generate embeddings (with cached duplicate bypass)
        # Update status to 'indexing'
        await db.documents_col.update_one(
            {"_id": document_id},
            {"$set": {"indexing_status": "indexing", "embedding_status": "processing"}}
        )

        collection = chroma_db.get_chunks_collection()
        embeddings = []
        
        # We process chunks, using the hash cache to check for identical strings
        uncached_texts = []
        uncached_indices = []
        
        for idx, chunk in enumerate(chunks_to_index):
            chunk_hash = chunk["hash"]
            # Look up in MongoDB chunks collection
            cached = await db.db["chunks"].find_one({"hash": chunk_hash})
            
            if cached:
                # Retrieve cached vector from ChromaDB
                try:
                    # chroma query by ID
                    chroma_res = await loop.run_in_executor(
                        None,
                        lambda: collection.get(ids=[cached["_id"]], include=["embeddings"])
                    )
                    if chroma_res and chroma_res.get("embeddings") and chroma_res["embeddings"]:
                        embeddings.append(chroma_res["embeddings"][0])
                        logger.info(f"Bypassed local embedding call (cache hit) for chunk {idx}")
                        continue
                except Exception as ex:
                    logger.warning(f"Failed to fetch vector from Chroma cache: {ex}")
            
            # Not cached or retrieval failed: queue for generation
            embeddings.append(None) # Placeholder
            uncached_texts.append(chunk["text"])
            uncached_indices.append(idx)

        # Generate vectors in batch for uncached chunks
        if uncached_texts:
            logger.info(f"Generating local embeddings for {len(uncached_texts)} uncached chunks")
            generated_vectors = await embedding_service.get_embeddings(uncached_texts)
            for idx, vec in zip(uncached_indices, generated_vectors):
                embeddings[idx] = vec

        # Validate that no None embeddings exist
        if any(e is None for e in embeddings):
            raise ValueError("Embedding generation failed for one or more chunks. Aborting insertion to avoid data corruption.")

        # 5. Insert vectors to ChromaDB
        chroma_ids = [c["id"] for c in chunks_to_index]
        chroma_documents = [c["text"] for c in chunks_to_index]
        chroma_metadatas = [{
            "document_id": document_id,
            "workspace_id": workspace_id,
            "page_number": c["page_number"],
            "chunk_index": c["chunk_index"],
            "section": c["section"],
            "hash": c["hash"],
            "source_type": c["metadata"].get("source_type", file_type)
        } for c in chunks_to_index]

        # Add to vector DB
        await loop.run_in_executor(
            None,
            lambda: collection.add(
                ids=chroma_ids,
                embeddings=embeddings,
                metadatas=chroma_metadatas,
                documents=chroma_documents
            )
        )

        # 6. Save chunks in MongoDB
        mongo_chunks = [{
            "_id": c["id"],
            "document_id": document_id,
            "workspace_id": workspace_id,
            "page_number": c["page_number"],
            "chunk_index": c["chunk_index"],
            "section": c["section"],
            "hash": c["hash"],
            "text": c["text"],
            "metadata": c["metadata"],
            "timestamp": time.time()
        } for c in chunks_to_index]
        
        await db.db["chunks"].insert_many(mongo_chunks)
        await db.db["chunks"].create_index([("text", "text")])

        # 7. Update MongoDB Document stats
        processing_time = time.time() - start_time
        await db.documents_col.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "indexing_status": "completed",
                    "index_status": "completed",
                    "embedding_status": "completed",
                    "num_chunks": len(chunks_to_index),
                    "processing_time": processing_time
                }
            }
        )
        logger.info(f"Indexing completed in {processing_time:.2f}s for document: {document_id}")

    except Exception as e:
        logger.error(f"Failed to index document {document_id}: {e}", exc_info=True)
        await db.documents_col.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "indexing_status": "failed",
                    "index_status": "failed",
                    "embedding_status": "failed",
                    "error_message": str(e)
                }
            }
        )
