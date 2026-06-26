import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.core.config import settings
from backend.database.mongo import db
from backend.database.chroma import chroma_db
from backend.api.status import router as status_router
from backend.api.workspaces import router as workspaces_router
from backend.api.files import router as files_router
from backend.api.search import router as search_router
from backend.api.chat import router as chat_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to MongoDB
    db.connect()
    # Test connection
    try:
        await db.client.admin.command('ping')
        print("Successfully connected to local MongoDB!")
        # Create text index for keyword search (Fixes BUG-028 & BUG-023)
        await db.db["chunks"].create_index([("text", "text")])
    except Exception as e:
        print(f"CRITICAL: Failed to connect to MongoDB on {settings.MONGODB_URI}: {e}")
        print("Please ensure MongoDB Community Server is installed and running.")
        raise SystemExit(1)

    # Initialize ChromaDB persistent storage
    try:
        chroma_db.connect()
        collection = chroma_db.get_chunks_collection()
        print(f"Successfully connected to ChromaDB! Current indexed chunk count: {collection.count()}")
    except Exception as e:
        print(f"CRITICAL: Failed to initialize ChromaDB: {e}")
        raise SystemExit(1)
        
    yield
    
    # Shutdown
    db.disconnect()
    print("Disconnected from databases.")

# Initialize FastAPI App
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Offline-first Enterprise AI Workspace powered by local models.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS Middleware
# Allows frontend development server (typically localhost:5173 or localhost:3000) to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include sub-routers
app.include_router(status_router, prefix="/api")
app.include_router(workspaces_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(chat_router, prefix="/api")

@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "status": "online",
        "description": "Enterprise Local Knowledge Studio API. Access endpoints via /api"
    }

if __name__ == "__main__":
    # Start uvicorn development server
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
