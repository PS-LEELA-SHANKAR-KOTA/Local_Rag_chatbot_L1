import httpx
from typing import List
from backend.core.config import settings

class EmbeddingService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.EMBEDDING_MODEL

    async def get_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text string."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={
                        "model": self.model,
                        "input": text
                    }
                )
                response.raise_for_status()
                data = response.json()
                # Ollama's /api/embed returns "embeddings": [[x, y, z...]]
                return data["embeddings"][0]
            except Exception as e:
                # Fallback to old /api/embeddings if new endpoint is not supported
                try:
                    response = await client.post(
                        f"{self.base_url}/api/embeddings",
                        json={
                            "model": self.model,
                            "prompt": text
                        }
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["embedding"]
                except Exception as ex:
                    raise Exception(f"Failed to generate embedding for text: {ex}. Original error: {e}")

    async def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of text strings in batch."""
        if not texts:
            return []
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={
                        "model": self.model,
                        "input": texts
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["embeddings"]
            except Exception as e:
                # If batch endpoint fails, compute sequentially
                embeddings = []
                for text in texts:
                    emb = await self.get_embedding(text)
                    embeddings.append(emb)
                return embeddings

embedding_service = EmbeddingService()
