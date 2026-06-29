import os
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# Monkeypatch posthog to prevent parameter mismatch logging errors inside ChromaDB telemetry
try:
    import posthog
    posthog.capture = lambda *args, **kwargs: None
    posthog.disabled = True
except ImportError:
    pass

import chromadb
from backend.core.config import settings

class ChromaDBManager:
    def __init__(self):
        self.client = None

    def connect(self):
        if not self.client:
            # Persistent client stores files in the chroma_db directory
            from chromadb.config import Settings as ChromaSettings
            self.client = chromadb.PersistentClient(
                path=settings.CHROMA_DB_PATH,
                settings=ChromaSettings(anonymized_telemetry=False)
            )

    def get_chunks_collection(self):
        self.connect()
        # We will use one unified collection and use metadata filtering to isolate workspaces
        # This makes global searching and single-workspace searching extremely flexible
        return self.client.get_or_create_collection(
            name="workspace_documents",
            metadata={"hnsw:space": "cosine"} # Use cosine similarity
        )

    def delete_document_chunks(self, document_id: str):
        if not document_id:
            return
        collection = self.get_chunks_collection()
        collection.delete(where={"document_id": document_id})

    def delete_workspace_chunks(self, workspace_id: str):
        if not workspace_id:
            return
        collection = self.get_chunks_collection()
        collection.delete(where={"workspace_id": workspace_id})

chroma_db = ChromaDBManager()
