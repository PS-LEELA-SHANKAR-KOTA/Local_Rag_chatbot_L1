import React, { useEffect, useState } from "react";
import { 
  Settings as SettingsIcon, 
  Database, 
  Cpu, 
  Trash2, 
  Edit3, 
  Plus, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  HardDrive, 
  Info
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { api, type SystemStatus } from "../services/api";
import { useNotificationStore } from "../store/notificationStore";

export const Settings: React.FC = () => {
  const { workspaces, activeWorkspace, fetchWorkspaces, deleteWorkspace, renameWorkspace, createWorkspace } = useWorkspaceStore();
  const { addNotification } = useNotificationStore();

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await api.getSystemStatus();
      setSystemStatus(res);
    } catch (err) {
      console.error(err);
      addNotification({
        type: "error",
        title: "Diagnostics Failed",
        message: "Failed to fetch system status"
      });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newWorkspaceName.trim(), `Workspace for ${newWorkspaceName.trim()}`);
      setNewWorkspaceName("");
      addNotification({
        type: "success",
        title: "Workspace Created",
        message: "Workspace created successfully"
      });
    } catch (err: any) {
      addNotification({
        type: "error",
        title: "Creation Failed",
        message: err.message || "Failed to create workspace"
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRenameWorkspace = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await renameWorkspace(id, editingName.trim(), editingDesc.trim());
      setEditingWorkspaceId(null);
      addNotification({
        type: "success",
        title: "Workspace Renamed",
        message: "Workspace updated successfully"
      });
    } catch (err: any) {
      addNotification({
        type: "error",
        title: "Rename Failed",
        message: err.message || "Failed to update workspace"
      });
    }
  };

  const handleDeleteWorkspace = async (id: string, name: string) => {
    if (workspaces.length <= 1) {
      addNotification({
        type: "warning",
        title: "Operation Restricted",
        message: "Cannot delete the last remaining workspace. Create another one first."
      });
      return;
    }
    if (confirm(`CRITICAL WARNING: Are you sure you want to delete workspace "${name}"?\n\nThis will permanently delete all raw files, extracted text, and vector embeddings belonging to this workspace.`)) {
      try {
        await deleteWorkspace(id);
        addNotification({
          type: "success",
          title: "Workspace Deleted",
          message: "Workspace deleted successfully"
        });
      } catch (err: any) {
        addNotification({
          type: "error",
          title: "Delete Failed",
          message: "Failed to delete workspace"
        });
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-background text-foreground fade-in">
      
      {/* Settings Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-blue-400" />
            <span>Control Center & Settings</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure workspaces, inspect offline models, check storage size, and diagnose service connections.
          </p>
        </div>
        <button 
          onClick={fetchStatus}
          disabled={statusLoading}
          className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
          <span>Refresh System Diagnostics</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Workspace Operations Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Workspaces List & Modifiers */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="h-4.5 w-4.5 text-indigo-400" />
              <span>Project Workspaces Isolation</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Workspaces containerise document metadata, semantic embeddings, and chat memory to keep projects isolated.
            </p>

            <div className="space-y-3">
              {workspaces.map((w) => (
                <div 
                  key={w.id} 
                  className={`p-4 rounded-xl border transition-all ${
                    activeWorkspace?.id === w.id 
                      ? 'border-blue-500/40 bg-blue-500/5' 
                      : 'border-border bg-black/10'
                  }`}
                >
                  {editingWorkspaceId === w.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Workspace Name</label>
                        <input 
                          type="text" 
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Description</label>
                        <input 
                          type="text" 
                          value={editingDesc}
                          onChange={(e) => setEditingDesc(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-center justify-end space-x-2 pt-1">
                        <button 
                          onClick={() => setEditingWorkspaceId(null)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-white transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleRenameWorkspace(w.id)}
                          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-[11px] font-semibold text-white transition-colors cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white">{w.name}</h4>
                          {activeWorkspace?.id === w.id && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-semibold border border-blue-500/20">
                              Active Scope
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{w.description || "No description provided."}</p>
                        <p className="text-[9px] text-muted-foreground/50 mt-1.5">Created: {new Date(w.created_at).toLocaleDateString()} {new Date(w.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button 
                          onClick={() => {
                            setEditingWorkspaceId(w.id);
                            setEditingName(w.name);
                            setEditingDesc(w.description || "");
                          }}
                          className="p-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                          title="Rename Workspace"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteWorkspace(w.id, w.name)}
                          className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete Workspace"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Create New Workspace */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="h-4.5 w-4.5 text-blue-400" />
              <span>Create New Workspace</span>
            </h3>
            <form onSubmit={handleCreateWorkspace} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">New Workspace Name</label>
                <input 
                  type="text" 
                  value={newWorkspaceName}
                  required
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g. Legal Audits, Technical Docs, Finance Reports"
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
              <button 
                type="submit"
                disabled={creating}
                className="py-2.5 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 h-[37px]"
              >
                <span>Add Workspace</span>
              </button>
            </form>
          </div>
        </div>

        {/* System Diagnostics & Guide Panel */}
        <div className="space-y-6">
          
          {/* Databases & Storage Status */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="h-4.5 w-4.5 text-purple-400" />
              <span>Database & Services State</span>
            </h3>

            <div className="space-y-3 text-xs">
              {/* Ollama Connection */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-black/10 border border-border/80">
                <span className="font-semibold text-white">Ollama inference service</span>
                <span className="flex items-center gap-1.5 font-bold">
                  {systemStatus?.ollama.status === "connected" ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-400">Offline</span>
                    </>
                  )}
                </span>
              </div>

              {/* MongoDB Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-black/10 border border-border/80">
                <span className="font-semibold text-white">MongoDB metadata cache</span>
                <span className="flex items-center gap-1.5 font-bold">
                  {systemStatus?.mongodb.status === "connected" ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-400">Offline</span>
                    </>
                  )}
                </span>
              </div>

              {/* ChromaDB Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-black/10 border border-border/80">
                <span className="font-semibold text-white">Chroma vector store</span>
                <span className="flex items-center gap-1.5 font-bold">
                  {systemStatus?.chromadb.status === "connected" ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-400">Offline</span>
                    </>
                  )}
                </span>
              </div>
            </div>
            
            {/* Storage Info */}
            {systemStatus && (
              <div className="border-t border-border/60 pt-3 space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Knowledge Base Storage size:</span>
                  <span className="text-white font-semibold">{formatSize(systemStatus.storage.uploads_size_bytes)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Available Disk Storage size:</span>
                  <span className="text-white font-semibold">{formatSize(systemStatus.storage.free_bytes)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total Vector Database Count:</span>
                  <span className="text-white font-semibold">{systemStatus.chromadb.vector_count} chunks</span>
                </div>
              </div>
            )}
          </div>

          {/* Model pull status guide */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="h-4.5 w-4.5 text-emerald-400" />
              <span>Local LLM & Vision Setup</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Verify that you have started Ollama locally and pulled the required models in your system terminal.
            </p>

            <div className="space-y-3.5">
              {/* Llama 3.2 Pill */}
              <div className="p-3 bg-black/10 border border-border/60 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-white">Llama 3.2 (3B)</h4>
                  <p className="text-[10px] text-muted-foreground">Text Generative Reasoning LLM</p>
                </div>
                {systemStatus?.ollama.llama ? (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">Installed</span>
                ) : (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">Missing</span>
                )}
              </div>

              {/* Mxbai Embed Large Pill */}
              <div className="p-3 bg-black/10 border border-border/60 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-white">mxbai-embed-large</h4>
                  <p className="text-[10px] text-muted-foreground">Semantic Text Vectors Model</p>
                </div>
                {systemStatus?.ollama.embedding ? (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">Installed</span>
                ) : (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">Missing</span>
                )}
              </div>

              {/* Qwen2.5-VL Pill */}
              <div className="p-3 bg-black/10 border border-border/60 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-white">qwen2.5vl:3b</h4>
                  <p className="text-[10px] text-muted-foreground">Vision LLM (OCR & Chart QA)</p>
                </div>
                {systemStatus?.ollama.vision ? (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">Installed</span>
                ) : (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">Missing</span>
                )}
              </div>
            </div>

            {/* Offline commands reminder */}
            <div className="p-3 bg-blue-500/5 border border-blue-500/25 rounded-lg text-[10px] leading-relaxed text-blue-400 space-y-1">
              <div className="flex items-center gap-1 font-bold text-white">
                <Info className="h-3.5 w-3.5 text-blue-400" />
                <span>Offline Ollama Pull Commands</span>
              </div>
              <p>Run these commands in your console to install offline capabilities:</p>
              <pre className="mt-1.5 p-2 bg-black/30 border border-border rounded font-mono text-[9px] text-slate-300 select-all block leading-tight">
{`ollama pull llama3.2:latest
ollama pull mxbai-embed-large:latest
ollama pull qwen2.5vl:3b`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
