import logging
import asyncio
import re
from typing import List, Dict, Any, Optional
from backend.database.mongo import db
from backend.database.chroma import chroma_db
from backend.embeddings.service import embedding_service

logger = logging.getLogger(__name__)

# Predefined synonyms map for expansion
SYNONYMS = {
    "invoice": ["billing", "receipt", "invoice", "payment", "bill", "transaction"],
    "billing": ["invoice", "payment", "receipt", "bill"],
    "receipt": ["invoice", "payment", "billing", "bill"],
    "developer": ["programmer", "engineer", "software", "coder", "developer"],
    "programmer": ["developer", "engineer", "software", "coder"],
    "engineer": ["developer", "programmer", "software", "coder"],
    "cost": ["revenue", "budget", "finance", "price", "expense", "cost"],
    "price": ["cost", "revenue", "budget", "finance", "expense"],
    "expense": ["cost", "price", "revenue", "budget", "finance"],
    "policy": ["conduct", "rules", "hr", "guidelines", "handbook", "policy"],
    "guidelines": ["policy", "rules", "conduct", "handbook", "guidelines"],
    "help": ["support", "documentation", "guide", "manual", "help"],
    "manual": ["guide", "user manual", "documentation", "help", "manual"],
    "code": ["software", "programming", "developer", "source", "code"],
    "api": ["interface", "endpoint", "integration", "api", "specification"]
}

class RetrievalService:
    def detect_language(self, query: str) -> str:
        """Determines query language using character-range unicode checks (offline)."""
        if not query:
            return "English"
        
        # Devanagari for Hindi
        hindi_chars = len(re.findall(r"[\u0900-\u097F]", query))
        # Telugu unicode blocks
        telugu_chars = len(re.findall(r"[\u0C00-\u0C7F]", query))
        
        if telugu_chars > 0:
            return "Telugu"
        elif hindi_chars > 0:
            return "Hindi"
        return "English"

    def normalize_query(self, query: str) -> str:
        """Normalizes query text: lowercase, strip extra whitespaces, resolve spellings."""
        if not query:
            return ""
        q = query.lower()
        q = re.sub(r"\s+", " ", q).strip()
        return q

    def expand_query(self, query: str) -> str:
        """Expands query using localized synonym mapping."""
        normalized = self.normalize_query(query)
        words = normalized.split()
        expanded_terms = list(words)
        
        for word in words:
            # Strip punctuation
            clean_word = re.sub(r"[^\w]", "", word)
            if clean_word in SYNONYMS:
                for syn in SYNONYMS[clean_word]:
                    if syn not in expanded_terms:
                        expanded_terms.append(syn)
                        
        return " ".join(expanded_terms)

    async def vector_search(
        self, 
        query: str, 
        workspace_id: Optional[str] = None, 
        top_k: int = 10,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Performs semantic vector search in ChromaDB."""
        try:
            # 1. Embed query (use normalized query for embeddings)
            norm_query = self.normalize_query(query)
            query_embedding = await embedding_service.get_embedding(norm_query)
            
            # 2. Prepare filter
            where_filter = {}
            if workspace_id and document_ids:
                if len(document_ids) == 1:
                    where_filter = {"$and": [{"workspace_id": workspace_id}, {"document_id": document_ids[0]}]}
                else:
                    where_filter = {"$and": [{"workspace_id": workspace_id}, {"document_id": {"$in": document_ids}}]}
            elif workspace_id:
                where_filter["workspace_id"] = workspace_id
            elif document_ids:
                if len(document_ids) == 1:
                    where_filter["document_id"] = document_ids[0]
                else:
                    where_filter["document_id"] = {"$in": document_ids}
                
            # 3. Query ChromaDB
            collection = chroma_db.get_chunks_collection()
            loop = asyncio.get_running_loop()
            
            # Run blocking chroma query in thread executor
            results = await loop.run_in_executor(
                None,
                lambda: collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k,
                    where=where_filter if where_filter else None
                )
            )
            
            # 4. Format results
            formatted_results = []
            if not results or not results.get("ids") or not results["ids"][0]:
                return []
                
            ids = results["ids"][0]
            documents = results["documents"][0]
            metadatas = results["metadatas"][0]
            distances = results["distances"][0]
            
            for idx in range(len(ids)):
                # Chroma distance is cosine distance (1 - cosine_similarity)
                # Let's convert it to a similarity score (0 to 1)
                similarity_score = 1.0 - distances[idx]
                
                formatted_results.append({
                    "chunk_id": ids[idx],
                    "text": documents[idx],
                    "document_id": metadatas[idx].get("document_id"),
                    "workspace_id": metadatas[idx].get("workspace_id"),
                    "page_number": metadatas[idx].get("page_number", 1),
                    "chunk_index": metadatas[idx].get("chunk_index", 0),
                    "source_type": metadatas[idx].get("source_type", "unknown"),
                    "score": similarity_score,
                    "search_type": "vector"
                })
                
            return formatted_results
        except Exception as e:
            logger.error(f"Vector search failed: {e}", exc_info=True)
            return []

    async def keyword_search(
        self, 
        query: str, 
        workspace_id: Optional[str] = None, 
        top_k: int = 10,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Performs full-text keyword search in MongoDB chunks collection."""
        try:
            # 1. Expand query to match synonyms for better recall in full-text search
            expanded_query = self.expand_query(query)
            
            # Create full-text query
            filter_query = {"$text": {"$search": expanded_query}}
            if workspace_id:
                filter_query["workspace_id"] = workspace_id
            if document_ids:
                filter_query["document_id"] = {"$in": document_ids}
                
            # Retrieve from MongoDB with text score
            cursor = db.db["chunks"].find(
                filter_query,
                {"score": {"$meta": "textScore"}}
            ).sort([("score", {"$meta": "textScore"})]).limit(top_k)
            
            mongo_chunks = await cursor.to_list(length=top_k)
            
            formatted_results = []
            for chunk in mongo_chunks:
                # Normalize text score for rank calculation
                score = chunk.get("score", 1.0)
                
                formatted_results.append({
                    "chunk_id": chunk["_id"],
                    "text": chunk["text"],
                    "document_id": chunk["document_id"],
                    "workspace_id": chunk["workspace_id"],
                    "page_number": chunk["page_number"],
                    "chunk_index": chunk["chunk_index"],
                    "source_type": chunk["metadata"].get("source_type", "unknown"),
                    "score": score,
                    "search_type": "keyword"
                })
                
            return formatted_results
        except Exception as e:
            logger.error(f"Keyword search failed: {e}", exc_info=True)
            return []

    def re_rank_candidates(self, query: str, candidates: List[Dict[str, Any]], top_n: int = 5) -> List[Dict[str, Any]]:
        """Re-ranks top retrieved chunks using a hybrid formula.
        
        Combines semantic similarity, term matching frequency, and page weight factors.
        """
        if not candidates:
            return []

        norm_query = self.normalize_query(query)
        words = norm_query.split()
        
        # Regex to detect page queries
        page_match = re.search(r"page\s+(\d+)", norm_query)
        target_page = int(page_match.group(1)) if page_match else None

        re_ranked = []
        for c in candidates:
            # 1. Semantic score (default to 0.4 if only keyword search found it)
            semantic_score = c["score"] if c.get("search_type") == "vector" else 0.4
            
            # 2. Lexical score (term matches / total words in chunk)
            text_lower = c["text"].lower()
            lexical_matches = 0
            for word in words:
                clean_word = re.sub(r"[^\w]", "", word)
                if clean_word:
                    lexical_matches += len(re.findall(r"\b" + re.escape(clean_word) + r"\b", text_lower))
            
            chunk_words = len(c["text"].split()) or 1
            lexical_score = min(1.0, lexical_matches / chunk_words)
            
            # 3. Page weight factors
            page_boost = 0.0
            page_num = c.get("page_number", 1)
            if target_page is not None:
                if page_num == target_page:
                    page_boost = 1.0
            
            # Calculate final re-ranked score
            # 50% semantic similarity, 30% word match frequency, 20% page weight
            final_score = (0.5 * semantic_score) + (0.3 * lexical_score) + (0.2 * page_boost)
            
            chunk_copy = dict(c)
            chunk_copy["rrf_score"] = final_score
            re_ranked.append(chunk_copy)
            
        # Sort desc
        re_ranked.sort(key=lambda x: x["rrf_score"], reverse=True)
        return re_ranked[:top_n]

    def compress_context(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Deduplicates redundant text and overlapping paragraphs across retrieved chunks."""
        seen_paragraphs = set()
        compressed_chunks = []
        
        for c in chunks:
            paragraphs = c["text"].split("\n\n")
            unique_paras = []
            
            for para in paragraphs:
                para_clean = para.strip()
                if not para_clean:
                    continue
                # Normalize paragraph content to check for similarity
                para_norm = re.sub(r"\s+", "", para_clean).lower()
                if para_norm not in seen_paragraphs:
                    seen_paragraphs.add(para_norm)
                    unique_paras.append(para_clean)
                    
            if unique_paras:
                new_chunk = dict(c)
                new_chunk["text"] = "\n\n".join(unique_paras)
                compressed_chunks.append(new_chunk)
                
        return compressed_chunks

    async def hybrid_search(
        self, 
        query: str, 
        workspace_id: Optional[str] = None, 
        top_k: int = 5, 
        rrf_k: int = 60,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Blends Vector and Keyword searches, re-ranks, and compresses context."""
        # Detect & log query language
        lang = self.detect_language(query)
        logger.info(f"Query language detected: {lang} for query: '{query}'")

        # Query top 20 candidates from both sources to ensure wide recall before re-ranking
        candidate_k = 20
        
        vector_task = self.vector_search(query, workspace_id, top_k=candidate_k, document_ids=document_ids)
        keyword_task = self.keyword_search(query, workspace_id, top_k=candidate_k, document_ids=document_ids)
        
        vector_results, keyword_results = await asyncio.gather(vector_task, keyword_task)
        
        # De-duplicate raw candidates by chunk_id
        candidates_map = {}
        for r in vector_results:
            candidates_map[r["chunk_id"]] = r
            
        for r in keyword_results:
            if r["chunk_id"] not in candidates_map:
                candidates_map[r["chunk_id"]] = r
                
        candidates = list(candidates_map.values())
        
        # Re-rank candidates (top 20 candidates -> top 5 chunks)
        re_ranked = self.re_rank_candidates(query, candidates, top_n=top_k)
        
        # Compress context to remove noise & overlapping duplicates
        compressed = self.compress_context(re_ranked)
        
        return compressed

retrieval_service = RetrievalService()
