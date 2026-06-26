import os
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Local AI Knowledge Studio"
    
    # Databases
    MONGODB_URI: str = Field(default="mongodb://localhost:27017", validation_alias="MONGODB_URI")
    DATABASE_NAME: str = "local_ai_studio"
    CHROMA_DB_PATH: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../chroma_db"))
    
    # Ollama Local LLM
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    LLM_MODEL: str = "llama3.2:latest"
    EMBEDDING_MODEL: str = "mxbai-embed-large:latest"
    VISION_MODEL: str = "qwen2.5vl:3b"
    
    # Storage & Uploads
    UPLOAD_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../uploads"))
    TEMP_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../temp"))
    
    # OCR Settings
    TESSERACT_CMD: str = "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.TEMP_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)
