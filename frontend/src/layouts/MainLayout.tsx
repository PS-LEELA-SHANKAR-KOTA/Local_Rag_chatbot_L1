import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  MessageSquare, 
  FolderOpen, 
  Settings, 
  Plus, 
  Trash2, 
  Database,
  Search,
  ChevronDown,
  Globe,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  X,
  FileText
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useChatStore } from "../store/chatStore";
import { useNotificationStore } from "../store/notificationStore";
import { api, type SystemStatus } from "../services/api";
import { NotificationToast } from "../components/NotificationToast";
import { OnboardingModal } from "../components/OnboardingModal";

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaces, activeWorkspace, fetchWorkspaces, setActiveWorkspace, createWorkspace } = useWorkspaceStore();
  const { addNotification } = useNotificationStore();
  const { 
    conversations, 
    activeConversation, 
    fetchConversations, 
    createConversation, 
    setActiveConversation, 
    deleteConversation,
    activeCitation,
    selectedFileForPreview,
    isContextPaneOpen,
    setSelectedFileForPreview,
    setContextPaneOpen
  } = useChatStore();
  
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // UI state layout collapses
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Load UI choices
  useEffect(() => {
    fetchWorkspaces();
    
    // Sidebar collapse state
    const collapsed = localStorage.getItem("sidebar_collapsed") === "true";
    setIsSidebarCollapsed(collapsed);

    // Theme state
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    const initialTheme = savedTheme || "dark";
    setTheme(initialTheme);
    if (initialTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (activeWorkspace) {
      fetchConversations(activeWorkspace.id);
    }
  }, [activeWorkspace, fetchConversations]);

  // Status check poll
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await api.getSystemStatus();
        setSystemStatus(status);
      } catch (err) {
        console.error("Status check failed", err);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  };

  const toggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    localStorage.setItem("sidebar_collapsed", String(nextState));
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setIsCreatingWorkspace(true);
    try {
      await createWorkspace(newWorkspaceName, `Workspace for ${newWorkspaceName}`);
      setNewWorkspaceName("");
      setShowNewWorkspaceModal(false);
    } catch (err: any) {
      addNotification({
        type: "error",
        title: "Workspace Creation Failed",
        message: err.message || String(err)
      });
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleNewChat = async () => {
    if (!activeWorkspace) return;
    try {
      const chat = await createConversation(activeWorkspace.id, `Chat ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`);
      setActiveConversation(chat);
      navigate("/chat");
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Document preview text state
  const [docPreviewData, setDocPreviewData] = useState<any>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);

  useEffect(() => {
    const loadFileText = async () => {
      if (!selectedFileForPreview) {
        setDocPreviewData(null);
        return;
      }
      setDocPreviewLoading(true);
      try {
        const res = await api.previewFile(selectedFileForPreview.id);
        setDocPreviewData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setDocPreviewLoading(false);
      }
    };
    loadFileText();
  }, [selectedFileForPreview]);

  const isOllamaConnected = systemStatus?.ollama.status === "connected";
  const isMongoConnected = systemStatus?.mongodb.status === "connected";
  const isChromaConnected = systemStatus?.chromadb.status === "connected";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-250">
      
      {/* SIDEBAR NAVIGATION PANEL */}
      <aside className={`border-r border-border glass-panel flex flex-col z-40 shrink-0 transition-all duration-300 absolute md:relative h-full ${
        isSidebarCollapsed ? "-translate-x-full md:translate-x-0 md:w-16" : "w-64 translate-x-0"
      }`}>
        {/* Expand/Collapse Trigger */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-18 bg-card border border-border text-muted-foreground hover:text-white p-1 rounded-full z-30 transition-colors shadow-lg cursor-pointer"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Logo and title */}
        <div className="p-4 border-b border-border/80 flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/10 flex-shrink-0">
            KS
          </div>
          {!isSidebarCollapsed && (
            <div className="fade-in truncate">
              <h1 className="font-bold text-sm leading-tight text-white">Knowledge Studio</h1>
              <p className="text-[10px] text-muted-foreground">Local Enterprise AI</p>
            </div>
          )}
        </div>

        {/* Workspace Quick-Access Dropdown inside sidebar */}
        <div className="p-3 border-b border-border/60 relative">
          {!isSidebarCollapsed && (
            <label className="text-[9px] uppercase font-bold text-muted-foreground/60 px-1 tracking-wider">Workspace</label>
          )}
          <button 
            onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
            className="w-full mt-1 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-between transition-colors text-left"
            title={isSidebarCollapsed ? activeWorkspace?.name : undefined}
          >
            <span className="truncate text-xs font-semibold text-white">
              {activeWorkspace ? activeWorkspace.name : "Select..."}
            </span>
            {!isSidebarCollapsed && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/80 flex-shrink-0 ml-1" />}
          </button>

          {showWorkspaceMenu && (
            <div className={`absolute left-3 right-3 mt-1 rounded-lg border border-border bg-card shadow-2xl p-1 z-30 max-h-60 overflow-y-auto ${
              isSidebarCollapsed ? "w-48 left-16" : ""
            }`}>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setActiveWorkspace(w);
                    setShowWorkspaceMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                    activeWorkspace?.id === w.id 
                      ? "bg-white/10 text-white font-semibold" 
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {w.name}
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => {
                    setShowNewWorkspaceModal(true);
                    setShowWorkspaceMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-xs text-blue-400 hover:bg-blue-500/10 flex items-center space-x-2 transition-colors font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Nav Links */}
        <nav className="p-3 space-y-1">
          <NavLink 
            to="/" 
            title="Dashboard Overview"
            className={({ isActive }) => 
              `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs transition-colors ${
                isActive 
                  ? "sidebar-item-active" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <LayoutDashboard className="h-4.5 w-4.5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="fade-in font-medium">Dashboard</span>}
          </NavLink>

          <NavLink 
            to="/chat" 
            title="Chat Assistant"
            className={({ isActive }) => 
              `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs transition-colors ${
                isActive && location.pathname === "/chat"
                  ? "sidebar-item-active" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <MessageSquare className="h-4.5 w-4.5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="fade-in font-medium">Chat Assistant</span>}
          </NavLink>

          <NavLink 
            to="/documents" 
            title="Knowledge Base"
            className={({ isActive }) => 
              `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs transition-colors ${
                isActive 
                  ? "sidebar-item-active" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <FolderOpen className="h-4.5 w-4.5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="fade-in font-medium">Knowledge Base</span>}
          </NavLink>

          <NavLink 
            to="/settings" 
            title="Settings & Diagnostics"
            className={({ isActive }) => 
              `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs transition-colors ${
                isActive 
                  ? "sidebar-item-active" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Settings className="h-4.5 w-4.5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="fade-in font-medium">Control Center</span>}
          </NavLink>
        </nav>

        {/* Chats History Panel (Hidden when collapsed) */}
        {!isSidebarCollapsed && (
          <div className="flex-1 flex flex-col min-h-0 border-t border-border/40 fade-in">
            <div className="p-3 pb-1 flex items-center justify-between">
              <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Recent Chats</span>
              {activeWorkspace && (
                <button 
                  onClick={handleNewChat}
                  className="p-1 rounded-md text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                  title="New Conversation"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {conversations.length === 0 ? (
                <div className="p-3 text-[10px] text-center text-muted-foreground/50 italic">
                  No chats yet
                </div>
              ) : (
                conversations.map((conv) => (
                  <div 
                    key={conv.id}
                    onClick={() => {
                      setActiveConversation(conv);
                      navigate("/chat");
                    }}
                    className={`group flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors ${
                      activeConversation?.id === conv.id 
                        ? "bg-white/5 text-white font-medium border border-white/5" 
                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="truncate flex-1 mr-2">{conv.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this conversation?")) {
                          deleteConversation(conv.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Database Status Panel Footer */}
        <div className="p-3 border-t border-border/80 bg-black/10 text-[10px] space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            {!isSidebarCollapsed && (
              <span className="flex items-center space-x-1.5">
                <Database className="h-3 w-3.5" />
                <span>Ollama</span>
              </span>
            )}
            <span 
              className={`h-1.5 w-1.5 rounded-full ${isOllamaConnected ? 'bg-green-500' : 'bg-red-500'}`} 
              title={isOllamaConnected ? "Ollama Connection OK" : "Ollama Disconnected"}
            />
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            {!isSidebarCollapsed && (
              <span className="flex items-center space-x-1.5">
                <Globe className="h-3 w-3.5" />
                <span>MongoDB</span>
              </span>
            )}
            <span 
              className={`h-1.5 w-1.5 rounded-full ${isMongoConnected ? 'bg-green-500' : 'bg-red-500'}`}
              title={isMongoConnected ? "MongoDB Server OK" : "MongoDB Disconnected"}
            />
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            {!isSidebarCollapsed && (
              <span className="flex items-center space-x-1.5">
                <Database className="h-3 w-3.5" />
                <span>Chroma</span>
              </span>
            )}
            <span 
              className={`h-1.5 w-1.5 rounded-full ${isChromaConnected ? 'bg-green-500' : 'bg-red-500'}`}
              title={isChromaConnected ? "ChromaDB Server OK" : "ChromaDB Disconnected"}
            />
          </div>
        </div>
      </aside>

      {/* CENTER WORKSPACE SECTION */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative z-10">
        
        {/* TOP SYSTEM NAVIGATION HEADER */}
        <header className="h-14 border-b border-border/80 glass-panel flex items-center justify-between px-4 md:px-6">
          {/* Mobile Sidebar Toggle */}
          <button 
            onClick={toggleSidebar} 
            className="md:hidden mr-3 p-1.5 rounded bg-white/5 text-muted-foreground hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>
          </button>
          
          {/* Global Search Bar (Arc-inspired) */}
          <form onSubmit={handleSearchSubmit} className="w-80 max-w-full">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/80" />
              <input
                type="text"
                placeholder="Search across all files (Press Enter)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-border/60 focus:border-blue-500 rounded-full py-1.5 pl-9 pr-4 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none transition-colors"
              />
            </div>
          </form>

          {/* Active Workspace badge & Dark Mode toggle */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1 text-muted-foreground mr-1">
              <span className="text-[10px]">Scope:</span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20 rounded">
                {activeWorkspace ? activeWorkspace.name : "None Selected"}
              </span>
            </div>

            {/* Dark/Light mode switch button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white border border-white/5 transition-colors cursor-pointer"
              title={theme === "dark" ? "Toggle Light Mode" : "Toggle Dark Mode"}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>

        {/* WORKSPACE CONTENT ROUTER */}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* COLLAPSIBLE RIGHT CONTEXT DRAWERS */}
      {isContextPaneOpen && (activeCitation || selectedFileForPreview) && (
        <aside className="w-80 md:w-96 border-l border-border glass-panel flex flex-col z-20 shrink-0 slide-in-right relative">
          {/* Header */}
          <div className="p-4 border-b border-border/80 flex items-center justify-between bg-black/10">
            <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <FileText className="h-4 w-4 text-blue-400" />
              <span>{activeCitation ? "Citation Source" : "Preview Inspector"}</span>
            </h3>
            <button
              onClick={() => setContextPaneOpen(false)}
              className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body Scroll Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* 1. CITATION DETAILS PANE */}
            {activeCitation && (
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] uppercase font-bold text-muted-foreground">Document Name</label>
                  <p className="text-xs font-semibold text-white mt-1 break-words">{activeCitation.document_name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Cited Page</label>
                    <p className="text-xs font-semibold text-blue-400 mt-1">Page {activeCitation.page_number}</p>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Document ID</label>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all select-all">{activeCitation.document_id}</p>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] uppercase font-bold text-muted-foreground">Source context block</label>
                  <div className="mt-1.5 p-3.5 bg-black/20 border border-border/80 rounded-lg text-xs leading-relaxed text-foreground select-text italic">
                    "{activeCitation.text_preview}"
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={async () => {
                      // Fetch document meta and view its full preview
                      try {
                        const docMeta = await api.getFileMetadata(activeCitation.document_id);
                        setSelectedFileForPreview(docMeta);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center block shadow-lg shadow-blue-500/10"
                  >
                    Load Document Details
                  </button>
                </div>
              </div>
            )}

            {/* 2. RICH FILE PREVIEW INSPECTOR */}
            {selectedFileForPreview && (
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] uppercase font-bold text-muted-foreground">Document Name</label>
                  <p className="text-xs font-semibold text-white mt-0.5 break-words">{selectedFileForPreview.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Category</label>
                    <p className="text-white font-medium mt-0.5">{selectedFileForPreview.category || "General Document"}</p>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Language</label>
                    <p className="text-white font-medium mt-0.5">{selectedFileForPreview.language || "English"}</p>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Pages Count</label>
                    <p className="text-white font-medium mt-0.5">{selectedFileForPreview.page_count || 1}</p>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Chunks</label>
                    <p className="text-white font-medium mt-0.5">{selectedFileForPreview.num_chunks}</p>
                  </div>
                </div>

                {/* Inline pages preview scroll */}
                <div className="border-t border-border/80 pt-3">
                  <label className="text-[9px] uppercase font-bold text-muted-foreground flex items-center space-x-1.5 mb-2">
                    <span>Document Context Excerpts</span>
                    {docPreviewLoading && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
                  </label>
                  
                  {docPreviewLoading ? (
                    <div className="py-10 text-center text-xs text-muted-foreground italic">
                      Parsing page contents...
                    </div>
                  ) : docPreviewData && docPreviewData.pages ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {docPreviewData.pages.map((p: any) => (
                        <div key={p.page_number} className="p-3 bg-black/15 border border-border/60 rounded-lg text-xs leading-relaxed">
                          <div className="text-[9px] uppercase font-bold text-muted-foreground border-b border-border/40 pb-1 mb-1.5">
                            Page {p.page_number}
                          </div>
                          <p className="text-foreground whitespace-pre-wrap select-text leading-relaxed">
                            {p.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-muted-foreground/60 italic">
                      No text preview available.
                    </div>
                  )}
                </div>

                {/* File keywords/topics tags */}
                {selectedFileForPreview.keywords && selectedFileForPreview.keywords.length > 0 && (
                  <div className="border-t border-border/60 pt-3">
                    <label className="text-[9px] uppercase font-bold text-muted-foreground">Keywords</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedFileForPreview.keywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 border border-border text-[9px] text-muted-foreground">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </aside>
      )}

      {/* NEW WORKSPACE MODAL */}
      {showNewWorkspaceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl relative">
            <h3 className="text-sm font-bold text-white mb-2">Create Workspace</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Workspaces isolate documents, vectors, and chat history for a project or department.
            </p>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Workspace Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AI Research, HR, Legal"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full mt-1 bg-white/5 border border-border focus:border-blue-500 rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewWorkspaceName("");
                    setShowNewWorkspaceModal(false);
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWorkspace}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
                >
                  {isCreatingWorkspace && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL TOAST ALERTS QUEUE */}
      <NotificationToast />
    </div>
  );
};
