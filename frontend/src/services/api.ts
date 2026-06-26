import axios from "axios";

export const API_BASE_URL = "http://localhost:8000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface Workspace {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Document {
  id: string;
  workspace_id: string;
  name: string;
  type: string;
  size: number;
  ocr_status: "pending" | "processing" | "completed" | "failed" | "not_needed";
  indexing_status: "pending" | "processing" | "indexing" | "completed" | "failed";
  num_chunks: number;
  created_at: string;
  author?: string;
  creation_date?: string;
  modified_date?: string;
  page_count?: number;
  language?: string;
  category?: string;
  keywords?: string[];
  topics?: string[];
  processing_time?: number;
  error_message?: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  document_id: string;
  document_name: string;
  page_number: number;
  text_preview: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  citations?: Citation[];
  confidence_score?: number;
  follow_up_questions?: string[];
  stats?: {
    search_time_seconds: number;
    total_api_time_seconds: number;
    num_chunks_retrieved: number;
  };
  created_at: string;
}

export interface SearchResult {
  chunk_id: string;
  text: string;
  document_id: string;
  document_name: string;
  workspace_id: string;
  page_number: number;
  chunk_index: number;
  source_type: string;
  rrf_score: number;
}

export interface DocumentPreview {
  document_id: string;
  document_name: string;
  pages: {
    page_number: number;
    text: string;
  }[];
}

export interface OCRTextResponse {
  document_id: string;
  document_name: string;
  ocr_text: string;
}

export interface AdvancedSearchParams {
  query: string;
  workspaceId?: string;
  category?: string;
  language?: string;
  fileType?: string;
  startDate?: string;
  endDate?: string;
  topK?: number;
}

export interface SystemStatus {
  ollama: {
    status: "connected" | "disconnected";
    models: string[];
    llama: boolean;
    embedding: boolean;
    vision: boolean;
  };
  mongodb: {
    status: "connected" | "disconnected";
    documents_count: number;
    workspaces_count: number;
    messages_count: number;
  };
  chromadb: {
    status: "connected" | "disconnected";
    vector_count: number;
  };
  storage: {
    total_bytes: number;
    free_bytes: number;
    uploads_size_bytes: number;
  };
}

export const api = {
  // Status
  getSystemStatus: async (): Promise<SystemStatus> => {
    const res = await apiClient.get<SystemStatus>("/status");
    return res.data;
  },

  // Workspaces
  listWorkspaces: async (): Promise<Workspace[]> => {
    const res = await apiClient.get<Workspace[]>("/workspaces");
    return res.data;
  },
  createWorkspace: async (name: string, description: string): Promise<Workspace> => {
    const res = await apiClient.post<Workspace>("/workspaces", { name, description });
    return res.data;
  },
  renameWorkspace: async (id: string, name: string, description?: string): Promise<Workspace> => {
    const res = await apiClient.patch<Workspace>(`/workspaces/${id}`, { name, description });
    return res.data;
  },
  deleteWorkspace: async (id: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${id}`);
  },

  // Documents
  listFiles: async (workspaceId?: string): Promise<Document[]> => {
    const url = workspaceId ? `/files?workspace_id=${workspaceId}` : "/files";
    const res = await apiClient.get<Document[]>(url);
    return res.data;
  },
  uploadFile: async (file: File, workspaceId: string): Promise<Document> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("workspace_id", workspaceId);
    const res = await apiClient.post<Document>("/files/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },
  deleteFile: async (id: string): Promise<void> => {
    await apiClient.delete(`/files/${id}`);
  },
  getFileMetadata: async (id: string): Promise<Document> => {
    const res = await apiClient.get<Document>(`/files/${id}`);
    return res.data;
  },
  getDownloadUrl: (id: string): string => {
    return `${API_BASE_URL}/files/${id}/download`;
  },
  reindexFile: async (id: string): Promise<Document> => {
    const res = await apiClient.post<Document>(`/files/${id}/reindex`);
    return res.data;
  },
  renameFile: async (id: string, name: string): Promise<Document> => {
    const res = await apiClient.patch<Document>(`/files/${id}`, { name });
    return res.data;
  },
  moveFile: async (id: string, workspaceId: string): Promise<Document> => {
    const res = await apiClient.patch<Document>(`/files/${id}/move`, { workspace_id: workspaceId });
    return res.data;
  },
  previewFile: async (id: string): Promise<DocumentPreview> => {
    const res = await apiClient.get<DocumentPreview>(`/files/${id}/preview`);
    return res.data;
  },
  getOcrText: async (id: string): Promise<OCRTextResponse> => {
    const res = await apiClient.get<OCRTextResponse>(`/files/${id}/ocr-text`);
    return res.data;
  },

  // Chat
  listConversations: async (workspaceId: string): Promise<Conversation[]> => {
    const res = await apiClient.get<Conversation[]>(`/chat/conversations?workspace_id=${workspaceId}`);
    return res.data;
  },
  createConversation: async (workspaceId: string, title: string = "New Chat"): Promise<Conversation> => {
    const res = await apiClient.post<Conversation>("/chat/conversations", {
      workspace_id: workspaceId,
      title,
    });
    return res.data;
  },
  getMessages: async (conversationId: string): Promise<Message[]> => {
    const res = await apiClient.get<Message[]>(`/chat/conversations/${conversationId}/messages`);
    return res.data;
  },
  deleteConversation: async (conversationId: string): Promise<void> => {
    await apiClient.delete(`/chat/conversations/${conversationId}`);
  },
  deleteMessage: async (messageId: string): Promise<void> => {
    await apiClient.delete(`/chat/messages/${messageId}`);
  },
  getStreamUrl: (conversationId: string, query: string): string => {
    return `${API_BASE_URL}/chat/conversations/${conversationId}/stream?query=${encodeURIComponent(query)}`;
  },

  // Search
  searchDocuments: async (query: string, workspaceId?: string, topK: number = 5): Promise<SearchResult[]> => {
    let url = `/search?query=${encodeURIComponent(query)}&top_k=${topK}`;
    if (workspaceId) {
      url += `&workspace_id=${workspaceId}`;
    }
    const res = await apiClient.get<SearchResult[]>(url);
    return res.data;
  },
  advancedSearchDocuments: async (params: AdvancedSearchParams): Promise<SearchResult[]> => {
    let url = `/search/advanced?query=${encodeURIComponent(params.query)}&top_k=${params.topK || 5}`;
    if (params.workspaceId) url += `&workspace_id=${params.workspaceId}`;
    if (params.category) url += `&category=${encodeURIComponent(params.category)}`;
    if (params.language) url += `&language=${encodeURIComponent(params.language)}`;
    if (params.fileType) url += `&file_type=${encodeURIComponent(params.fileType)}`;
    if (params.startDate) url += `&start_date=${encodeURIComponent(params.startDate)}`;
    if (params.endDate) url += `&end_date=${encodeURIComponent(params.endDate)}`;
    
    const res = await apiClient.get<SearchResult[]>(url);
    return res.data;
  },
  analyzeImage: async (file: File, prompt?: string): Promise<{ analysis: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    if (prompt) {
      formData.append("prompt", prompt);
    }
    const res = await apiClient.post<{ analysis: string }>("/search/image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },
};
