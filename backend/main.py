import os
import uvicorn
import asyncio
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
        print(f"Failed to connect to MongoDB on {settings.MONGODB_URI}: {e}")
        print("Attempting to automatically start local MongoDB database...")
        
        import subprocess
        import shutil
        import glob
        
        mongod_path = None
        if shutil.which("mongod"):
            mongod_path = shutil.which("mongod")
        else:
            # Look in common Windows installation paths
            paths = glob.glob(r"C:\Program Files\MongoDB\Server\*\bin\mongod.exe")
            if paths:
                paths.sort()
                mongod_path = paths[-1]
                
        if mongod_path:
            # Create a user-space data directory
            data_dir = os.path.expanduser("~/mongodb_data")
            os.makedirs(data_dir, exist_ok=True)
            print(f"Starting MongoDB server at: {mongod_path} using data directory: {data_dir}")
            try:
                # Start process in background without opening console window
                creation_flags = 0
                if os.name == 'nt':
                    creation_flags = 0x08000000  # CREATE_NO_WINDOW
                subprocess.Popen(
                    [mongod_path, "--dbpath", data_dir],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags
                )
                
                # Wait for startup and retry connection
                connected = False
                for attempt in range(6):
                    print(f"Waiting for MongoDB to initialize (attempt {attempt + 1}/6)...")
                    await asyncio.sleep(1.5)
                    try:
                        db.disconnect()
                        db.connect()
                        await db.client.admin.command('ping')
                        print("Successfully connected to automatically started MongoDB server!")
                        await db.db["chunks"].create_index([("text", "text")])
                        connected = True
                        break
                    except Exception:
                        pass
                
                if not connected:
                    raise Exception("Connection timed out after starting MongoDB server process.")
            except Exception as startup_err:
                print(f"CRITICAL: Failed to automatically start MongoDB: {startup_err}")
                print("Please ensure MongoDB Community Server is installed and running.")
                raise SystemExit(1)
        else:
            print("CRITICAL: MongoDB is not running and mongod executable could not be found.")
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
    import sys
    # Start uvicorn development server
    # Disable reload by default to prevent watchfiles loop crashes in virtual environments
    should_reload = "--reload" in sys.argv
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    uvicorn.run(
        "backend.main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=should_reload,
        reload_dirs=[backend_dir] if should_reload else None,
        reload_excludes=["**/venv/**", "**/uploads/**", "**/*.log"] if should_reload else None
    )
