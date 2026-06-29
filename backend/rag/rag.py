import json
import logging
import httpx
import time
from typing import List, Dict, Any, AsyncGenerator, Optional
from bson import ObjectId
from backend.core.config import settings
from backend.database.mongo import db
from backend.retrieval.retrieval import retrieval_service

logger = logging.getLogger(__name__)

class RAGService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.LLM_MODEL

    async def get_conversation_history(self, conversation_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Retrieves the last N messages of a conversation formatted for Ollama."""
        cursor = db.messages_col.find(
            {"conversation_id": conversation_id}
        ).sort("created_at", -1)
        
        # Get last messages to avoid overloading the context window
        messages = await cursor.to_list(length=limit)
        messages = messages[::-1]
        
        history = []
        for msg in messages:
            history.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        return history

    async def generate_response(
        self, 
        query: str, 
        workspace_id: str, 
        conversation_id: str
    ) -> AsyncGenerator[str, None]:
        """Main RAG response streaming pipeline.
        
        Yields JSON string lines for SSE (Server-Sent Events).
        """
        start_time = time.time()
        # 1. Retrieve relevant chunks
        logger.info(f"RAG: Retrieving context for query: '{query}' in workspace: {workspace_id}")
        chunks = await retrieval_service.hybrid_search(query, workspace_id, top_k=5)
        search_time = time.time() - start_time
        
        # 2. Get document metadata for source naming
        doc_ids = list(set([c["document_id"] for c in chunks if c.get("document_id")]))
        doc_names_map = {}
        if doc_ids:
            cursor = db.documents_col.find({"_id": {"$in": doc_ids}})
            docs = await cursor.to_list(length=len(doc_ids))
            doc_names_map = {doc["_id"]: doc["name"] for doc in docs}

        # 3. Format Context
        context_blocks = []
        citations = []
        
        for idx, chunk in enumerate(chunks):
            doc_name = doc_names_map.get(chunk["document_id"], "Unknown Document")
            page_num = chunk.get("page_number", 1)
            
            # Record citation source
            citations.append({
                "document_id": chunk["document_id"],
                "document_name": doc_name,
                "page_number": page_num,
                "text_preview": chunk["text"][:150] + "..."
            })
            
            # Format context block
            context_blocks.append(
                f"[Source ID: {idx}] Document: '{doc_name}' | Page: {page_num}\n"
                f"Content: {chunk['text']}"
            )
            
        context_str = "\n\n---\n\n".join(context_blocks)

        # 4. Fetch memory
        history = await self.get_conversation_history(conversation_id, limit=8)

        # 5. Build system prompt
        system_prompt = (
            "You are an expert Enterprise AI Assistant. Use the provided context to answer the user's question.\n"
            "Rules:\n"
            "1. You MUST structure your response as follows:\n"
            "   a. First, output a reasoning block enclosed in <think> and </think> tags. To minimize latency, keep this block EXTREMELY BRIEF (under 10 words) stating only which documents you are referencing, then close the </think> tag immediately.\n"
            "   b. Second, output your main answer to the user's question based ONLY on the provided context. Cite your sources in the text using bracketed source indices like [Source ID: X], where X is the Source ID specified in the context.\n"
            "   c. If the context does not contain the answer, say that you cannot find the answer in the local documents, but answer using general knowledge if helpful, clearly stating it is general knowledge.\n"
            "   d. NEVER make up facts or citations.\n"
            "   e. At the very end of your response, you MUST output a metadata block separated by '<<<METADATA>>>' containing a Confidence score (1-10) and exactly 2 or 3 Follow-up questions.\n"
            "   f. Keep your main response extremely concise, direct, and short (under 150 words). Avoid unnecessary background explanations.\n"
            "Format the metadata block EXACTLY like this:\n"
            "<<<METADATA>>>\n"
            "CONFIDENCE: <number 1-10>\n"
            "FOLLOWUPS:\n"
            "- <Follow-up question 1>\n"
            "- <Follow-up question 2>\n"
        )

        # 6. Construct message payload
        messages = [{"role": "system", "content": system_prompt}]
        
        # Append history
        for msg in history:
            messages.append(msg)
            
        # Append latest prompt with context
        user_prompt_content = (
            f"Context from local files:\n{context_str}\n\n"
            f"User Question: {query}"
        )
        messages.append({"role": "user", "content": user_prompt_content})

        # Send initial citation list event
        yield f"event: citations\ndata: {json.dumps(citations)}\n\n"

        # 7. Query Ollama and stream output using LangChain ChatOllama
        from langchain_ollama import ChatOllama
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        lc_messages = []
        for msg in messages:
            if msg["role"] == "system":
                lc_messages.append(SystemMessage(content=msg["content"]))
            elif msg["role"] == "user":
                lc_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))

        chat_model = ChatOllama(
            base_url=self.base_url,
            model=self.model,
            temperature=0.0,
            num_ctx=4096,
            keep_alive="1h",
            num_predict=768
        )

        try:
            # Save user query to DB before streaming to prevent data loss on model crash
            await db.messages_col.insert_one({
                "conversation_id": conversation_id,
                "role": "user",
                "content": query,
                "created_at": ObjectId().generation_time
            })

            reasoning_mode = False
            message_mode = False
            metadata_mode = False
            
            buffer = ""
            metadata_buffer = ""
            assistant_response = ""

            async for chunk in chat_model.astream(lc_messages):
                chunk_text = chunk.content
                if not chunk_text:
                    continue
                
                assistant_response += chunk_text
                buffer += chunk_text

                # 1. Check for initial state transition
                if not reasoning_mode and not message_mode and not metadata_mode:
                    if "<think>" in buffer:
                        reasoning_mode = True
                        parts = buffer.split("<think>", 1)
                        if parts[0]:
                            yield f"event: message\ndata: {json.dumps({'text': parts[0]})}\n\n"
                        buffer = parts[1]
                    elif len(buffer) > 10:
                        message_mode = True

                # 2. Handle Reasoning Mode
                if reasoning_mode:
                    if "</think>" in buffer:
                        parts = buffer.split("</think>", 1)
                        reasoning_text = parts[0]
                        if reasoning_text:
                            yield f"event: reasoning\ndata: {json.dumps({'text': reasoning_text})}\n\n"
                        reasoning_mode = False
                        message_mode = True
                        buffer = parts[1]
                    else:
                        # Keep last 8 chars to avoid yielding partial "</think>"
                        if len(buffer) > 8:
                            to_yield = buffer[:-8]
                            yield f"event: reasoning\ndata: {json.dumps({'text': to_yield})}\n\n"
                            buffer = buffer[-8:]

                # 3. Handle Message Mode
                elif message_mode and not metadata_mode:
                    if "<<<METADATA>>>" in buffer:
                        parts = buffer.split("<<<METADATA>>>", 1)
                        message_text = parts[0]
                        if message_text:
                            yield f"event: message\ndata: {json.dumps({'text': message_text})}\n\n"
                        metadata_mode = True
                        metadata_buffer = "<<<METADATA>>>" + parts[1]
                        buffer = ""
                    else:
                        # Keep last 15 chars to avoid yielding partial "<<<METADATA>>>"
                        if len(buffer) > 15:
                            to_yield = buffer[:-15]
                            yield f"event: message\ndata: {json.dumps({'text': to_yield})}\n\n"
                            buffer = buffer[-15:]

                # 4. Handle Metadata Mode
                elif metadata_mode:
                    metadata_buffer += buffer
                    buffer = ""

            # Flush remaining buffer at the end
            if reasoning_mode:
                if buffer:
                    yield f"event: reasoning\ndata: {json.dumps({'text': buffer})}\n\n"
            elif message_mode and not metadata_mode:
                if "<<<METADATA>>>" in buffer:
                    parts = buffer.split("<<<METADATA>>>", 1)
                    message_text = parts[0]
                    if message_text:
                        yield f"event: message\ndata: {json.dumps({'text': message_text})}\n\n"
                    metadata_mode = True
                    metadata_buffer += "<<<METADATA>>>" + parts[1]
                else:
                    if buffer:
                        yield f"event: message\ndata: {json.dumps({'text': buffer})}\n\n"
            elif metadata_mode:
                metadata_buffer += buffer

            # 8. Parse metadata (Confidence & Follow-ups)
            confidence_score = 7
            follow_ups = []
            
            if metadata_buffer:
                # Parse the metadata buffer
                lines = metadata_buffer.split("\n")
                is_followup = False
                
                for l in lines:
                    l = l.strip()
                    if "CONFIDENCE:" in l.upper():
                        try:
                            score_part = l.split(":", 1)[1].strip()
                            # Extract number
                            score_num = "".join([c for c in score_part if c.isdigit()])
                            if score_num:
                                confidence_score = int(score_num)
                        except Exception:
                            pass
                    elif "FOLLOWUPS:" in l.upper():
                        is_followup = True
                    elif is_followup and (l.startswith("-") or l.startswith("*") or (l and l[0].isdigit() and l[1] in [".", ")"])):
                        # Extract follow-up question text
                        question = l.lstrip("-*0123456789. ")
                        if question:
                            follow_ups.append(question)

            # Fallbacks if LLM fails formatting
            if not follow_ups:
                follow_ups = [
                    f"Would you like me to elaborate on the details of this document?",
                    f"Can you tell me more about your specific objective with this information?"
                ]

            # Send metadata events
            yield f"event: confidence\ndata: {json.dumps({'score': confidence_score})}\n\n"
            yield f"event: followups\ndata: {json.dumps(follow_ups)}\n\n"
            
            # 9. Send stats event
            api_time = time.time() - start_time
            stats = {
                "search_time_seconds": round(search_time, 3),
                "total_api_time_seconds": round(api_time, 3),
                "num_chunks_retrieved": len(chunks),
                "sources": citations
            }
            yield f"event: stats\ndata: {json.dumps(stats)}\n\n"
            
            # 10. Save assistant response to DB
            # Clean up assistant response by removing the think tags and the metadata section
            clean_response = assistant_response
            if "<think>" in clean_response and "</think>" in clean_response:
                try:
                    parts = clean_response.split("</think>", 1)
                    clean_response = parts[1].strip()
                except Exception:
                    pass
            else:
                clean_response = clean_response.replace("<think>", "").replace("</think>", "")
                
            clean_response = clean_response.split("<<<METADATA>>>")[0].strip()
            
            # Extract reasoning response as well if present
            reasoning_content = ""
            if "<think>" in assistant_response and "</think>" in assistant_response:
                try:
                    reasoning_content = assistant_response.split("<think>", 1)[1].split("</think>", 1)[0].strip()
                except Exception:
                    pass
            
            # Save assistant message to DB
            await db.messages_col.insert_one({
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": clean_response,
                "reasoning": reasoning_content,
                "citations": citations,
                "confidence_score": confidence_score,
                "follow_up_questions": follow_ups,
                "stats": stats,
                "created_at": ObjectId().generation_time
            })
            
            # Update conversation timestamp
            await db.conversations_col.update_one(
                {"_id": conversation_id},
                {"$set": {"updated_at": ObjectId().generation_time}}
            )
            
            # Send done event
            yield "event: done\ndata: {}\n\n"
            
        except Exception as e:
            logger.error(f"Error streaming response from Ollama: {e}", exc_info=True)
            yield f"event: fatal_error\ndata: {json.dumps({'detail': str(e)})}\n\n"

logger.info("Initializing RAG service")
rag_service = RAGService()
