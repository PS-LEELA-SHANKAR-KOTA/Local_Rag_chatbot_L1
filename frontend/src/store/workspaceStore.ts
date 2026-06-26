import { create } from "zustand";
import { api, type Workspace } from "../services/api";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  
  fetchWorkspaces: () => Promise<void>;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  createWorkspace: (name: string, description: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string, description: string) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const workspaces = await api.listWorkspaces();
      set({ workspaces, isLoading: false });
      
      // Auto-select first workspace if none is active
      const currentActive = get().activeWorkspace;
      if (workspaces.length > 0 && (!currentActive || !workspaces.find(w => w.id === currentActive.id))) {
        set({ activeWorkspace: workspaces[0] });
      } else if (workspaces.length === 0) {
        set({ activeWorkspace: null });
      }
    } catch (err: any) {
      set({ error: err.response?.data?.detail || "Failed to fetch workspaces", isLoading: false });
    }
  },

  setActiveWorkspace: (workspace) => {
    set({ activeWorkspace: workspace });
  },

  createWorkspace: async (name, description) => {
    set({ isLoading: true, error: null });
    try {
      const newWorkspace = await api.createWorkspace(name, description);
      set(state => ({
        workspaces: [...state.workspaces, newWorkspace],
        activeWorkspace: state.activeWorkspace ? state.activeWorkspace : newWorkspace,
        isLoading: false
      }));
      return newWorkspace;
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "Failed to create workspace";
      set({ error: errMsg, isLoading: false });
      throw new Error(errMsg);
    }
  },

  renameWorkspace: async (id, name, description) => {
    set({ isLoading: true, error: null });
    try {
      const updatedWorkspace = await api.renameWorkspace(id, name, description);
      const updatedList = get().workspaces.map(w => w.id === id ? updatedWorkspace : w);
      set({ 
        workspaces: updatedList, 
        isLoading: false 
      });
      if (get().activeWorkspace?.id === id) {
        set({ activeWorkspace: updatedWorkspace });
      }
      return updatedWorkspace;
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "Failed to rename workspace";
      set({ error: errMsg, isLoading: false });
      throw new Error(errMsg);
    }
  },

  deleteWorkspace: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteWorkspace(id);
      const updated = get().workspaces.filter(w => w.id !== id);
      set({ workspaces: updated, isLoading: false });
      
      // Reset active workspace if deleted
      if (get().activeWorkspace?.id === id) {
        set({ activeWorkspace: updated.length > 0 ? updated[0] : null });
      }
    } catch (err: any) {
      set({ error: err.response?.data?.detail || "Failed to delete workspace", isLoading: false });
      throw err;
    }
  }
}));
