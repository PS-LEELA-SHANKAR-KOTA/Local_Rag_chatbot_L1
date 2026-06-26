import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
  Search as SearchIcon, 
  FileText, 
  ChevronRight, 
  ArrowLeft, 
  Loader2,
  AlertCircle,
  Filter,
  Calendar,
  Sliders,
  ChevronDown,
  ChevronUp,
  X,
  BookOpen
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useChatStore } from "../store/chatStore";
import { useNotificationStore } from "../store/notificationStore";
import { api, type SearchResult } from "../services/api";

export const Search: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeWorkspace } = useWorkspaceStore();
  const { setSelectedFileForPreview } = useChatStore();
  const { addNotification } = useNotificationStore();
  
  const query = searchParams.get("q") || "";
  
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Advanced search filters states
  const [showFilters, setShowFilters] = useState(false);
  const [filterWorkspace, setFilterWorkspace] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterFileType, setFilterFileType] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [topK, setTopK] = useState(5);

  useEffect(() => {
    const runSearch = async () => {
      if (!query.trim()) return;
      setIsLoading(true);
      setError(null);
      try {
        const workspaceId = filterWorkspace ? activeWorkspace?.id : undefined;
        const res = await api.advancedSearchDocuments({
          query,
          workspaceId,
          category: filterCategory || undefined,
          language: filterLanguage || undefined,
          fileType: filterFileType || undefined,
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined,
          topK
        });
        setResults(res);
        if (res.length > 0) {
          setSelectedResult(res[0]);
        } else {
          setSelectedResult(null);
        }
      } catch (err) {
        setError("Failed to run advanced search queries. Ensure backend is running.");
      } finally {
        setIsLoading(false);
      }
    };

    runSearch();
  }, [
    query, 
    activeWorkspace, 
    filterWorkspace, 
    filterCategory, 
    filterLanguage, 
    filterFileType, 
    filterStartDate, 
    filterEndDate, 
    topK
  ]);

  const clearFilters = () => {
    setFilterCategory("");
    setFilterLanguage("");
    setFilterFileType("");
    setFilterStartDate("");
    setFilterEndDate("");
    setTopK(5);
    setFilterWorkspace(true);
    addNotification({
      type: "info",
      title: "Filters Reset",
      message: "Search parameters reverted to default."
    });
  };

  const loadDocumentDetails = async (docId: string) => {
    try {
      addNotification({
        type: "info",
        title: "Loading Source Details",
        message: "Fetching document metadata and parsing page streams..."
      });
      const docMeta = await api.getFileMetadata(docId);
      setSelectedFileForPreview(docMeta);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Load Failed",
        message: "Could not retrieve document context details."
      });
    }
  };

  const hasActiveFilters = 
    filterCategory !== "" || 
    filterLanguage !== "" || 
    filterFileType !== "" || 
    filterStartDate !== "" || 
    filterEndDate !== "" || 
    topK !== 5 || 
    !filterWorkspace;

  return (
    <div className="h-full flex flex-col bg-background p-6 space-y-4 overflow-hidden fade-in">
      {/* Header & Back Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2 border-b border-border/40">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer border border-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <SearchIcon className="h-5 w-5 text-blue-400" />
              <span>Search Results</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing hybrid matches for: <span className="text-white font-semibold">"{query}"</span>
            </p>
          </div>
        </div>

        {/* Filter Toggle Button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors border cursor-pointer ${
            showFilters || hasActiveFilters
              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
              : "bg-white/5 border-border text-muted-foreground hover:text-white"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>Advanced Filters</span>
          {hasActiveFilters && (
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          )}
          {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* EXPANDABLE FILTER CONTAINER */}
      {showFilters && (
        <div className="border border-border/80 bg-card/65 rounded-xl p-4 space-y-4 animate-slide-down">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sliders className="h-3.5 w-3.5 text-blue-400" />
              <span>Filter Parameters</span>
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {/* Scope selection */}
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold">Search Scope</label>
              <select
                value={filterWorkspace ? "current" : "all"}
                onChange={(e) => setFilterWorkspace(e.target.value === "current")}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="current" className="bg-background">Active Workspace Only</option>
                <option value="all" className="bg-background">Entire Studio (Global Search)</option>
              </select>
            </div>

            {/* Category selection */}
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="" className="bg-background">All Categories</option>
                <option value="Invoice/Receipt" className="bg-background">Invoice/Receipt</option>
                <option value="Research Paper" className="bg-background">Research Paper</option>
                <option value="User Manual" className="bg-background">User Manual</option>
                <option value="Corporate Policy" className="bg-background">Corporate Policy</option>
                <option value="Technical Documentation" className="bg-background">Technical Documentation</option>
                <option value="Financial Spreadsheet" className="bg-background">Financial Spreadsheet</option>
                <option value="Presentation Deck" className="bg-background">Presentation Deck</option>
                <option value="General Document" className="bg-background">General Document</option>
              </select>
            </div>

            {/* Language selection */}
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold">Language</label>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="" className="bg-background">All Languages</option>
                <option value="English" className="bg-background">English</option>
                <option value="Hindi" className="bg-background">Hindi (हिन्दी)</option>
                <option value="Telugu" className="bg-background">Telugu (తెలుగు)</option>
              </select>
            </div>

            {/* File Format selection */}
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold">File Format</label>
              <select
                value={filterFileType}
                onChange={(e) => setFilterFileType(e.target.value)}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="" className="bg-background">All Formats</option>
                <option value="pdf" className="bg-background">PDF Document</option>
                <option value="docx" className="bg-background">Word (.docx)</option>
                <option value="xlsx" className="bg-background">Excel (.xlsx)</option>
                <option value="csv" className="bg-background">CSV Spreadsheet</option>
                <option value="pptx" className="bg-background">Powerpoint (.pptx)</option>
                <option value="txt" className="bg-background">Text file (.txt)</option>
                <option value="md" className="bg-background">Markdown (.md)</option>
                <option value="png" className="bg-background">PNG Image</option>
                <option value="jpg" className="bg-background">JPEG Image</option>
              </select>
            </div>

            {/* Date range filters */}
            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>Start Date</span>
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] text-muted-foreground uppercase font-bold flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>End Date</span>
              </label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-white/5 border border-border rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              />
            </div>

            {/* TopK slider */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[9px] text-muted-foreground uppercase font-bold flex justify-between">
                <span>Maximum Matches returned (Top K)</span>
                <span className="text-white font-bold">{topK} items</span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full accent-blue-500 mt-2 cursor-ew-resize"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Split Display Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* Left Side: Results List */}
        <div className="lg:col-span-2 border border-border bg-card/65 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground font-bold">
            <span>Matches ({results.length})</span>
            {filterWorkspace && activeWorkspace ? (
              <span>Workspace Scope: {activeWorkspace.name}</span>
            ) : (
              <span>Global Scope: Entire Knowledge Studio</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-2 space-y-1">
            {isLoading ? (
              <div className="h-full flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-400 text-xs flex items-center justify-center space-x-2">
                <AlertCircle className="h-4.5 w-4.5" />
                <span>{error}</span>
              </div>
            ) : results.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground/60 italic text-xs">
                No matching documents found. Try adjusting keywords or widening filters.
              </div>
            ) : (
              results.map((r) => (
                <div
                  key={r.chunk_id}
                  onClick={() => setSelectedResult(r)}
                  className={`p-3.5 rounded-lg cursor-pointer transition-all flex items-start justify-between space-x-4 border ${
                    selectedResult?.chunk_id === r.chunk_id
                      ? "bg-white/5 border-blue-500/30 shadow-md"
                      : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center space-x-1 font-semibold text-blue-400">
                        <FileText className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{r.document_name}</span>
                      </span>
                      <span>•</span>
                      <span>Page {r.page_number}</span>
                      <span>•</span>
                      <span className="uppercase font-semibold">{r.source_type}</span>
                    </div>
                    
                    <p className="text-xs text-foreground leading-relaxed line-clamp-2 italic select-text">
                      "...{r.text}..."
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0 flex flex-col justify-between h-12">
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold">
                      Score: {r.rrf_score.toFixed(4)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Excerpt detailed view */}
        <div className="border border-border bg-card/65 rounded-xl p-5 flex flex-col min-h-0 overflow-y-auto">
          {selectedResult ? (
            <div className="space-y-4">
              <h4 className="font-bold text-sm text-white flex items-center space-x-1.5 border-b border-border pb-3">
                <FileText className="h-4.5 w-4.5 text-blue-400" />
                <span>Text Chunk Details</span>
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Source File</label>
                  <p className="text-white font-medium mt-0.5 break-all">{selectedResult.document_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Location</label>
                    <p className="text-white font-medium mt-0.5 font-semibold text-blue-400">Page {selectedResult.page_number}</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Format</label>
                    <p className="text-white font-medium mt-0.5 uppercase">{selectedResult.source_type}</p>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Fusion Ranking Score</label>
                  <p className="text-white font-mono mt-0.5 font-semibold text-emerald-400">{selectedResult.rrf_score.toFixed(6)}</p>
                </div>

                <div className="border-t border-border pt-4">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold">Extracted Text Context</label>
                  <div className="mt-2 p-3.5 bg-black/30 border border-border rounded-lg text-xs leading-relaxed text-foreground max-h-60 overflow-y-auto italic select-text">
                    "{selectedResult.text}"
                  </div>
                </div>

                {/* Inspect document link inside search */}
                <div className="pt-2 border-t border-border/60">
                  <button
                    onClick={() => loadDocumentDetails(selectedResult.document_id)}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-lg shadow-blue-500/10"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Open in Context Drawer</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <FileText className="h-10 w-10 text-muted-foreground/45 mb-2" />
              <p className="text-xs">Select a search match to show the full extracted context slice.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
