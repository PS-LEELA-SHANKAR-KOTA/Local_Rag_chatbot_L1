import React, { useState, useRef, useEffect } from "react";
import { 
  FolderUp, 
  Upload, 
  FileText, 
  Loader2, 
  Trash2, 
  AlertTriangle, 
  Search, 
  ShieldCheck, 
  FolderOpen, 
  Edit3, 
  RefreshCw, 
  Eye, 
  Layers, 
  LayoutGrid, 
  List
} from "lucide-react";
import { useFileStore } from "../store/fileStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { type Document } from "../services/api";
import { useChatStore } from "../store/chatStore";
import { useNotificationStore } from "../store/notificationStore";

export const KnowledgeBase: React.FC = () => {
  const { activeWorkspace, workspaces } = useWorkspaceStore();
  const { 
    files, 
    isLoading, 
    isUploading, 
    fetchFiles, 
    uploadFiles, 
    deleteFile,
    reindexFile,
    renameFile,
    moveFile,
    stopPolling
  } = useFileStore();

  const { setSelectedFileForPreview } = useChatStore();
  const { addNotification } = useNotificationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<Document | null>(null);

  // Layout View mode state (Grid vs List)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeWorkspace) {
      fetchFiles(activeWorkspace.id);
    }
    return () => {
      stopPolling();
    };
  }, [activeWorkspace, fetchFiles, stopPolling]);

  // Load layout preferences
  useEffect(() => {
    const savedMode = localStorage.getItem("kb_view_mode") as "grid" | "list" | null;
    if (savedMode) {
      setViewMode(savedMode);
    }
  }, []);

  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("kb_view_mode", mode);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (!activeWorkspace) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const allowedExts = [".pdf", ".docx", ".doc", ".xlsx", ".csv", ".txt", ".md", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"];
      const validFiles = Array.from(e.dataTransfer.files).filter(f => {
        const ext = f.name.includes('.') ? "." + f.name.split('.').pop()?.toLowerCase() : "";
        return allowedExts.includes(ext);
      });

      if (validFiles.length === 0) {
        addNotification({
          type: "error",
          title: "Upload Failed",
          message: "No supported files found in selection."
        });
        return;
      }

      try {
        addNotification({
          type: "info",
          title: "Upload Started",
          message: `Uploading ${validFiles.length} document(s) locally.`
        });
        await uploadFiles(validFiles, activeWorkspace.id);
        addNotification({
          type: "success",
          title: "Upload Successful",
          message: "Files saved to local storage. Generating embeddings..."
        });
      } catch (err) {
        addNotification({
          type: "error",
          title: "Upload Failed",
          message: "Could not save documents to local disk."
        });
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeWorkspace) return;
    if (e.target.files && e.target.files.length > 0) {
      const allowedExts = [".pdf", ".docx", ".doc", ".xlsx", ".csv", ".txt", ".md", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp"];
      const validFiles = Array.from(e.target.files).filter(f => {
        const ext = f.name.includes('.') ? "." + f.name.split('.').pop()?.toLowerCase() : "";
        return allowedExts.includes(ext);
      });

      if (validFiles.length === 0) {
        addNotification({
          type: "error",
          title: "Import Error",
          message: "No supported files found."
        });
        return;
      }

      try {
        addNotification({
          type: "info",
          title: "Upload Started",
          message: `Importing ${validFiles.length} file(s)...`
        });
        await uploadFiles(validFiles, activeWorkspace.id);
        addNotification({
          type: "success",
          title: "Upload Completed",
          message: "Documents imported. Indexing pipeline triggered."
        });
      } catch (err) {
        addNotification({
          type: "error",
          title: "Import Error",
          message: "Failed to parse uploaded folders/files."
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

  const triggerForceReindex = async (docId: string) => {
    if (confirm("Clear vector indexes and force re-parsing of this document?")) {
      addNotification({
        type: "info",
        title: "Reindexing",
        message: "Clearing chunks and starting Tesseract/mxbai pipeline..."
      });
      try {
        await reindexFile(docId);
        addNotification({
          type: "success",
          title: "Reindexing Queued",
          message: "Parsing pipeline restarted in the background."
        });
      } catch (err) {
        addNotification({
          type: "error",
          title: "Reindex failed",
          message: "Could not restart document indexer."
        });
      }
    }
  };

  const triggerFileDelete = async (docId: string) => {
    if (confirm("Delete file and all its vector embeddings permanently?")) {
      try {
        await deleteFile(docId);
        addNotification({
          type: "success",
          title: "File Deleted",
          message: "Document and chunks removed completely."
        });
        if (selectedFile?.id === docId) {
          setSelectedFile(null);
        }
      } catch (err) {
        addNotification({
          type: "error",
          title: "Delete Failed",
          message: "Failed to remove database records."
        });
      }
    }
  };

  const triggerFileRename = async (docId: string, currentName: string) => {
    const name = prompt("Enter new filename:", currentName);
    if (name && name.trim() && name.trim() !== currentName) {
      try {
        await renameFile(docId, name.trim());
        addNotification({
          type: "success",
          title: "File Renamed",
          message: `Filename updated to: ${name.trim()}`
        });
        if (selectedFile?.id === docId) {
          setSelectedFile({ ...selectedFile, name: name.trim() });
        }
      } catch (err) {
        addNotification({
          type: "error",
          title: "Rename Failed",
          message: "Failed to update record in MongoDB."
        });
      }
    }
  };

  const triggerFileMove = async (docId: string, targetWorkspaceId: string) => {
    const wName = workspaces.find(w => w.id === targetWorkspaceId)?.name;
    if (confirm(`Move this document to workspace: "${wName}"?`)) {
      try {
        await moveFile(docId, targetWorkspaceId, activeWorkspace!.id);
        addNotification({
          type: "success",
          title: "File Moved",
          message: `Document relocated to: ${wName}`
        });
        if (selectedFile?.id === docId) {
          setSelectedFile(null);
        }
      } catch (err) {
        addNotification({
          type: "error",
          title: "Move Failed",
          message: "Could not shift document to target directory."
        });
      }
    }
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const targetWorkspaces = workspaces.filter(w => w.id !== activeWorkspace?.id);

  return (
    <div className="h-full flex flex-col bg-background p-6 space-y-6 overflow-hidden fade-in">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 pb-4 border-b border-border/40">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <FolderOpen className="h-5 w-5 text-blue-400" />
            <span>Document Knowledge Base</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import, inspect metadata properties, and manage vector indices offline.
          </p>
        </div>
        
        {/* Controls Layout */}
        <div className="flex items-center space-x-3">
          {/* Layout Mode switch */}
          <div className="flex items-center bg-white/5 border border-border rounded-lg p-0.5">
            <button
              onClick={() => toggleViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
              }`}
              title="Grid View Cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => toggleViewMode("list")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "list" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
              }`}
              title="List View Table"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search field */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-border focus:border-blue-500 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Main Split Layout Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* Left Side: Upload zone and listings */}
        <div className="lg:col-span-2 flex flex-col space-y-4 min-h-0">
          
          {/* DRAG DROP ZONE */}
          {activeWorkspace ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                dragActive 
                  ? "border-blue-500 bg-blue-500/5" 
                  : "border-border/80 bg-card/30 hover:bg-card/45"
              }`}
            >
              {isUploading ? (
                <div className="space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
                  <p className="text-xs text-white font-semibold">Generating vectors...</p>
                  <p className="text-[10px] text-muted-foreground">Running local Tesseract OCR & embedding models...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-full bg-white/5 text-muted-foreground w-max mx-auto">
                    <Upload className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <p className="text-xs text-white font-semibold">Drag & Drop folders or files here</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Supports PDF, Word Doc, Excel Sheet, CSV, Slide presentation, or Images</p>
                  </div>
                  <div className="flex items-center justify-center space-x-2 pt-1.5">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      multiple 
                      className="hidden" 
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Files</span>
                    </button>

                    <input 
                      type="file" 
                      ref={folderInputRef} 
                      onChange={handleFileSelect} 
                      // @ts-ignore
                      webkitdirectory=""
                      directory=""
                      multiple 
                      className="hidden" 
                    />
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-border rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <FolderUp className="h-3.5 w-3.5" />
                      <span>Import Folders</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 border border-border bg-card/20 rounded-xl flex items-center justify-center text-center text-xs text-muted-foreground italic">
              Please select a workspace context to upload files.
            </div>
          )}

          {/* DOCUMENT LIST PANEL */}
          <div className="flex-1 border border-border bg-card/65 rounded-xl flex flex-col min-h-0 overflow-hidden">
            
            {/* GRID VIEW LAYOUT */}
            {viewMode === "grid" ? (
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading && filteredFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                    No files found in workspace knowledge base.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => setSelectedFile(file)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between h-40 ${
                          selectedFile?.id === file.id
                            ? "bg-white/5 border-blue-500/40 shadow-lg shadow-blue-500/5"
                            : "bg-card border-border hover:border-white/15"
                        }`}
                      >
                        {/* Upper Details */}
                        <div className="space-y-1">
                          <div className="flex items-start justify-between">
                            <span className="flex items-center space-x-1.5 font-bold text-xs text-white max-w-[80%] truncate">
                              <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                              <span className="truncate">{file.name}</span>
                            </span>
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60">{file.type}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-muted-foreground/80">
                            <span>{formatSize(file.size)}</span>
                            <span>•</span>
                            <span>Pg {file.page_count || 1}</span>
                            <span>•</span>
                            <span>{file.language || "English"}</span>
                          </div>
                        </div>

                        {/* Middle Badges */}
                        <div className="flex items-center gap-1.5 my-2">
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-border text-[9px] text-muted-foreground leading-none">
                            {file.category || "General Document"}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none ${
                            file.indexing_status === "completed" 
                              ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                              : file.indexing_status === "failed"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                          }`}>
                            {file.indexing_status}
                          </span>
                        </div>

                        {/* Lower Actions & metadata */}
                        <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                          <span className="text-[9px] text-muted-foreground/60">Chunks: <strong>{file.num_chunks}</strong></span>
                          
                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedFileForPreview(file)}
                              className="p-1 rounded text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              title="Inspect document & OCR page text"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => triggerFileRename(file.id, file.name)}
                              className="p-1 rounded text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              title="Rename document"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => triggerForceReindex(file.id)}
                              className="p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-white/5 transition-colors cursor-pointer"
                              title="Force indexing pipelines"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => triggerFileDelete(file.id)}
                              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                              title="Delete file"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* LIST VIEW TABLE LAYOUT */
              <div className="flex-grow overflow-y-auto">
                <table className="w-full text-left text-xs text-muted-foreground">
                  <thead>
                    <tr className="border-b border-border pb-2 text-[10px] uppercase font-bold text-muted-foreground sticky top-0 bg-card z-10">
                      <th className="p-3">File Name</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Chunks</th>
                      <th className="p-3">Indexing</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {isLoading && filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-400" />
                        </td>
                      </tr>
                    ) : filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground/60 italic">
                          No documents matched.
                        </td>
                      </tr>
                    ) : (
                      filteredFiles.map((file) => (
                        <tr 
                          key={file.id} 
                          onClick={() => setSelectedFile(file)}
                          className={`hover:bg-white/5 transition-colors cursor-pointer ${
                            selectedFile?.id === file.id ? "bg-white/5" : ""
                          }`}
                        >
                          <td className="p-3 text-white font-medium truncate max-w-[200px] flex items-center space-x-2">
                            <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </td>
                          <td className="p-3">{formatSize(file.size)}</td>
                          <td className="p-3 text-muted-foreground/80">{file.category || "General Document"}</td>
                          <td className="p-3 font-semibold text-white">{file.num_chunks}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              file.indexing_status === "completed" 
                                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                                : file.indexing_status === "failed"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                            }`}>
                              {file.indexing_status}
                            </span>
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => setSelectedFileForPreview(file)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                title="Page layout preview"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => triggerFileRename(file.id, file.name)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                title="Rename document"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => triggerForceReindex(file.id)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-blue-400 hover:bg-white/5 transition-colors cursor-pointer"
                                title="Reindex chunks"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => triggerFileDelete(file.id)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                                title="Delete file"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>

        {/* Right Side: Detail controls card (Self-collapsing fallback) */}
        <div className="border border-border bg-card/65 rounded-xl p-5 flex flex-col min-h-0 overflow-y-auto">
          {selectedFile ? (
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-white flex items-center space-x-1.5 border-b border-border pb-3">
                <FileText className="h-4.5 w-4.5 text-blue-400" />
                <span>Document Details</span>
              </h4>

              <div className="space-y-3 text-xs">
                {/* File display */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">File Name</label>
                    <p className="text-white font-medium mt-0.5 break-all">{selectedFile.name}</p>
                  </div>
                  <button
                    onClick={() => triggerFileRename(selectedFile.id, selectedFile.name)}
                    className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-colors cursor-pointer flex-shrink-0"
                    title="Rename file"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Document ID</label>
                  <p className="font-mono text-muted-foreground mt-0.5 break-all select-all">{selectedFile.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Size</label>
                    <p className="text-white font-medium mt-0.5">{formatSize(selectedFile.size)}</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Format</label>
                    <p className="text-white font-medium mt-0.5 uppercase">{selectedFile.type}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Chunks</label>
                    <p className="text-white font-medium mt-0.5">{selectedFile.num_chunks}</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Import Date</label>
                    <p className="text-white font-medium mt-0.5">{new Date(selectedFile.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Relocate Workspace */}
                {targetWorkspaces.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Relocate to Workspace</label>
                    <select
                      onChange={(e) => {
                        const targetId = e.target.value;
                        if (targetId) {
                          triggerFileMove(selectedFile.id, targetId);
                        }
                        e.target.value = "";
                      }}
                      className="w-full mt-1.5 bg-white/5 border border-border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="" className="bg-background text-muted-foreground">Select destination...</option>
                      {targetWorkspaces.map(w => (
                        <option key={w.id} value={w.id} className="bg-background text-white">{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Inspect Action Panel */}
                <div className="border-t border-border pt-3 space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Workspace Operations</label>
                  
                  <button
                    onClick={() => setSelectedFileForPreview(selectedFile)}
                    className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-semibold text-blue-400 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View Parsed Pages layout</span>
                  </button>

                  <button
                    onClick={() => triggerForceReindex(selectedFile.id)}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Re-index Document</span>
                  </button>
                </div>

                {/* Heuristic metadata tag list */}
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center space-x-1 text-[10px] text-muted-foreground uppercase font-bold">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    <span>Parsed Metadata</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Class category:</span>
                      <span className="text-white font-medium">{selectedFile.category || "General Document"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Language:</span>
                      <span className="text-white font-medium">{selectedFile.language || "English"}</span>
                    </div>
                    {selectedFile.author && selectedFile.author !== "Unknown" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Author:</span>
                        <span className="text-white font-medium truncate max-w-[130px]">{selectedFile.author}</span>
                      </div>
                    )}
                    {selectedFile.processing_time !== undefined && selectedFile.processing_time > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Parse time:</span>
                        <span className="text-white font-medium">{selectedFile.processing_time.toFixed(2)}s</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Security checks */}
                <div className="border-t border-border pt-3 space-y-1.5">
                  <div className="flex items-center space-x-2 text-[10px] text-muted-foreground uppercase font-bold">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span className="text-white">Offline compliance OK</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    This file is stored, parsed, and embedded locally on this computer. No network connections are triggered.
                  </p>
                </div>

                {selectedFile.error_message && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-400 leading-relaxed flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Error during parsing: {selectedFile.error_message}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <FileText className="h-10 w-10 text-muted-foreground/45 mb-2" />
              <p className="text-xs">Select a document in the table to display its structural details, chunk count, parsing heuristics, and actions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
