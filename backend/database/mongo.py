import motor.motor_asyncio
from backend.core.config import settings

class MongoDB:
    def __init__(self):
        self.client = None
        self.db = None
        
    def connect(self):
        if not self.client or self.db is None:
            self.client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
            self.db = self.client[settings.DATABASE_NAME]
            
    def disconnect(self):
        if self.client:
            self.client.close()
            self.client = None
            self.db = None

    @property
    def workspaces_col(self):
        self.connect()
        return self.db["workspaces"]

    @property
    def documents_col(self):
        self.connect()
        return self.db["documents"]

    @property
    def conversations_col(self):
        self.connect()
        return self.db["conversations"]

    @property
    def messages_col(self):
        self.connect()
        return self.db["messages"]

    @property
    def system_status_col(self):
        self.connect()
        return self.db["system_status"]

db = MongoDB()
