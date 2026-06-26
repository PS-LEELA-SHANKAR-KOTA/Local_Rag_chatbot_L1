import { create } from "zustand";
import { api, type Document } from "../services/api";

interface FileState {
  files: Document[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  pollingIntervalId: number | null;

  fetchFiles: (workspaceId?: string) => Promise<void>;
  uploadFiles: (filesList: FileList | File[], workspaceId: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  reindexFile: (id: string) => Promise<void>;
  renameFile: (id: string, name: string) => Promise<void>;
  moveFile: (id: string, workspaceId: string, currentWorkspaceId: string) => Promise<void>;
  startPolling: (workspaceId: string) => void;
  stopPolling: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  isLoading: false,
  isUploading: false,
  error: null,
  pollingIntervalId: null,

  fetchFiles: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const files = await api.listFiles(workspaceId);
      set({ files, isLoading: false });
      
      // Auto-trigger polling if any file is still processing
      const hasTransient = files.some(
        f => ["pending", "processing", "indexing"].includes(f.indexing_status)
      );
      if (hasTransient && workspaceId) {
        get().startPolling(workspaceId);
      } else if (!hasTransient) {
        get().stopPolling();
      }
    } catch (err: any) {
      set({ error: "Failed to load workspace files", isLoading: false });
    }
  },

  uploadFiles: async (filesList, workspaceId) => {
    set({ isUploading: true, error: null });
    try {
      const uploadPromises = Array.from(filesList).map(file =>
        api.uploadFile(file, workspaceId)
      );
      
      const newDocs = await Promise.all(uploadPromises);
      set(state => ({
        files: [...newDocs, ...state.files],
        isUploading: false
      }));

      // Start status polling
      get().startPolling(workspaceId);
    } catch (err: any) {
      set({ error: "Failed to upload one or more files", isUploading: false });
      throw err;
    }
  },

  deleteFile: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteFile(id);
      set(state => ({
        files: state.files.filter(f => f.id !== id),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: "Failed to delete file", isLoading: false });
      throw err;
    }
  },

  reindexFile: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const updatedDoc = await api.reindexFile(id);
      set(state => ({
        files: state.files.map(f => f.id === id ? updatedDoc : f),
        isLoading: false
      }));
      // Start polling
      if (updatedDoc.workspace_id) {
        get().startPolling(updatedDoc.workspace_id);
      }
    } catch (err: any) {
      set({ error: "Failed to reindex file", isLoading: false });
      throw err;
    }
  },

  renameFile: async (id, name) => {
    set({ isLoading: true, error: null });
    try {
      const updatedDoc = await api.renameFile(id, name);
      set(state => ({
        files: state.files.map(f => f.id === id ? updatedDoc : f),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: "Failed to rename file", isLoading: false });
      throw err;
    }
  },

  moveFile: async (id, workspaceId, _currentWorkspaceId) => {
    set({ isLoading: true, error: null });
    try {
      await api.moveFile(id, workspaceId);
      // Remove from current workspace files list
      set(state => ({
        files: state.files.filter(f => f.id !== id),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: "Failed to move file", isLoading: false });
      throw err;
    }
  },

  startPolling: (workspaceId) => {
    const existing = get().pollingIntervalId;
    if (existing) {
      window.clearInterval(existing);
    }

    const intervalId = window.setInterval(async () => {
      try {
        const files = await api.listFiles(workspaceId);
        set({ files });
        
        // Stop if all files completed indexing
        const hasTransient = files.some(
          f => ["pending", "processing", "indexing"].includes(f.indexing_status)
        );
        if (!hasTransient) {
          get().stopPolling();
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 3000);

    set({ pollingIntervalId: intervalId });
  },

  stopPolling: () => {
    const intervalId = get().pollingIntervalId;
    if (intervalId) {
      clearInterval(intervalId);
      set({ pollingIntervalId: null });
    }
  }
}));
