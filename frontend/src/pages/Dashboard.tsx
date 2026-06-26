import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FileText, 
  Cpu, 
  HardDrive, 
  MessageSquare, 
  FolderUp, 
  Image, 
  ArrowRight,
  Plus,
  Search,
  Database,
  Clock,
  Sparkles,
  BookOpen
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useChatStore } from "../store/chatStore";
import { useFileStore } from "../store/fileStore";
import { api, type SystemStatus } from "../services/api";

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspaceStore();
  const { conversations, createConversation, setActiveConversation, fetchConversations } = useChatStore();
  const { files, fetchFiles } = useFileStore();

  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.getSystemStatus();
        setStatus(res);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStatus();
    
    if (activeWorkspace) {
      fetchFiles(activeWorkspace.id);
      fetchConversations(activeWorkspace.id);
    }
  }, [activeWorkspace, fetchFiles, fetchConversations]);

  const handleStartChat = async () => {
    if (!activeWorkspace) return;
    try {
      const chat = await createConversation(activeWorkspace.id, `Chat ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
      setActiveConversation(chat);
      navigate("/chat");
    } catch (err) {
      console.error(err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Heuristic calculators
  const totalChunks = files.reduce((acc, f) => acc + (f.num_chunks || 0), 0);
  const totalImages = files.filter(f => 
    ["png", "jpg", "jpeg", "webp", "tiff", "bmp"].includes(f.type.toLowerCase())
  ).length;
  const totalDocs = files.length - totalImages;

  const recentUploads = files.slice(0, 4);
  const recentChats = conversations.slice(0, 4);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 fade-in bg-background text-foreground">
      
      {/* Welcome Header banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400 animate-pulse-subtle" />
            <span>Workspace: {activeWorkspace ? activeWorkspace.name : "Select Workspace"}</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Offline Enterprise AI Workspace — Monitor models, manage files, and execute semantic queries.
          </p>
        </div>
        
        {/* Model quick status pill */}
        {status?.ollama.status === "connected" ? (
          (status.ollama.llama || status.ollama.embedding) ? (
            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center space-x-1.5 w-max">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Local AI Ready</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold flex items-center space-x-1.5 w-max">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Models Missing</span>
            </div>
          )
        ) : (
          <div className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center space-x-1.5 w-max">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span>Ollama Offline</span>
          </div>
        )}
      </div>

      {/* STATISTICS CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Documents count */}
        <div className="p-4 rounded-xl border border-border/80 bg-card glass-card flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Documents / Sheets</p>
            <h3 className="text-lg font-bold text-white">{totalDocs}</h3>
            <p className="text-[10px] text-muted-foreground/60">{files.length} items total</p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-400">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: Vision Images count */}
        <div className="p-4 rounded-xl border border-border/80 bg-card glass-card flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Scans & Images</p>
            <h3 className="text-lg font-bold text-white">{totalImages}</h3>
            <p className="text-[10px] text-muted-foreground/60">{totalChunks} chunks indexed</p>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Image className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Storage usage bytes */}
        <div className="p-4 rounded-xl border border-border/80 bg-card glass-card flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Storage Occupied</p>
            <h3 className="text-lg font-bold text-white">
              {status ? formatSize(status.storage.uploads_size_bytes) : "0 Bytes"}
            </h3>
            <p className="text-[10px] text-muted-foreground/60 truncate max-w-[140px]">
              Disk Free: {status ? formatSize(status.storage.free_bytes) : "0 GB"}
            </p>
          </div>
          <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-400">
            <HardDrive className="h-5 w-5" />
          </div>
        </div>

        {/* Card 4: AI models active */}
        <div className="p-4 rounded-xl border border-border/80 bg-card glass-card flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Inference Engine</p>
            <h3 className="text-lg font-bold text-white truncate max-w-[130px]">
              {status?.ollama.status === "connected" ? (status.ollama.llama ? "Llama 3.2" : "Model Missing") : "Offline"}
            </h3>
            <p className={`text-[10px] flex items-center gap-1 ${status?.ollama.vision ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              <span className={`h-1.5 w-1.5 rounded-full inline-block ${status?.ollama.vision ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              <span>Qwen2.5-VL {status?.ollama.vision ? 'ready' : 'missing'}</span>
            </p>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Cpu className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS ROW */}
      <div className="space-y-2.5">
        <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Quick Actions</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Action: New Chat */}
          <button
            onClick={handleStartChat}
            disabled={!activeWorkspace}
            className="p-4 rounded-xl border border-border bg-card hover:bg-white/5 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:scale-105 transition-transform">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1">
                <span>Start New Chat</span>
                <ArrowRight className="h-3 w-3" />
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Chat with workspace context</p>
            </div>
          </button>

          {/* Action: Upload File */}
          <button
            onClick={() => navigate("/documents")}
            disabled={!activeWorkspace}
            className="p-4 rounded-xl border border-border bg-card hover:bg-white/5 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:scale-105 transition-transform">
              <FolderUp className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors flex items-center gap-1">
                <span>Upload Documents</span>
                <ArrowRight className="h-3 w-3" />
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Index new documents offline</p>
            </div>
          </button>

          {/* Action: Search */}
          <button
            onClick={() => navigate("/search?q=summary")}
            disabled={!activeWorkspace}
            className="p-4 rounded-xl border border-border bg-card hover:bg-white/5 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:scale-105 transition-transform">
              <Search className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                <span>Search Knowledge</span>
                <ArrowRight className="h-3 w-3" />
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Query BM25 & semantic vectors</p>
            </div>
          </button>

          {/* Action: Create Workspace */}
          <button
            onClick={async () => {
              const name = prompt("Enter new workspace name:");
              if (name && name.trim()) {
                try {
                  await useWorkspaceStore.getState().createWorkspace(name.trim(), `Workspace for ${name.trim()}`);
                  navigate("/chat");
                } catch (err) {
                  console.error(err);
                }
              }
            }}
            className="p-4 rounded-xl border border-border bg-card hover:bg-white/5 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-32 group"
          >
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:scale-105 transition-transform">
              <Plus className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1">
                <span>New Workspace</span>
                <ArrowRight className="h-3 w-3" />
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Create isolated projects</p>
            </div>
          </button>
          
        </div>
      </div>

      {/* LOWER SPLIT DETAILS PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Recent Files list */}
        <div className="lg:col-span-2 border border-border bg-card/65 rounded-xl p-5 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
            <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span>Workspace Uploads</span>
            </h4>
            <button
              onClick={() => navigate("/documents")}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold"
            >
              Manage All
            </button>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs text-muted-foreground">
              <thead>
                <tr className="border-b border-border/60 pb-2 text-[9px] uppercase font-bold text-muted-foreground/80">
                  <th className="py-2">File Name</th>
                  <th className="py-2">Format</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {recentUploads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground/50 italic">
                      No files uploaded to this workspace yet. Click "Upload Documents" to get started.
                    </td>
                  </tr>
                ) : (
                  recentUploads.map((file) => (
                    <tr 
                      key={file.id} 
                      onClick={() => navigate("/documents")}
                      className="hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="py-3 text-white font-medium truncate max-w-[200px]">{file.name}</td>
                      <td className="py-3 uppercase font-semibold">{file.type}</td>
                      <td className="py-3 text-muted-foreground/80">{file.category || "General Document"}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          file.indexing_status === "completed" 
                            ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                            : file.indexing_status === "failed"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                        }`}>
                          {file.indexing_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Recent Chats list */}
        <div className="border border-border bg-card/65 rounded-xl p-5 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
            <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-purple-400" />
              <span>Recent Chats</span>
            </h4>
            <button
              onClick={() => navigate("/chat")}
              className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
            >
              Open Chat
            </button>
          </div>

          <div className="flex-grow space-y-2 overflow-y-auto">
            {recentChats.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground/50 italic text-xs">
                No recent chat histories.
              </div>
            ) : (
              recentChats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveConversation(c);
                    navigate("/chat");
                  }}
                  className="p-3 border border-border/80 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-blue-400 transition-colors pr-2">
                      {c.title}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Last active: {new Date(c.updated_at || c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white transition-colors flex-shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Model checklist detail panel at bottom */}
      <div className="p-4 rounded-xl border border-border/80 bg-black/10 text-xs leading-relaxed text-muted-foreground">
        <h5 className="font-bold text-white text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Database className="h-4 w-4 text-blue-400" />
          <span>Local Stack Diagnosis</span>
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          <div>
            <p className="font-semibold text-white">MongoDB Persistence</p>
            <p className="mt-0.5">Primary metadata storage active. Port 27017 connection established.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Chroma Vector DB</p>
            <p className="mt-0.5">HNSW cosine metric collections active. Storing embeddings locally in chroma_db/.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Ollama Interface</p>
            <p className="mt-0.5">Streaming models Llama3.2:3b and mxbai-embed-large on port 11434.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
