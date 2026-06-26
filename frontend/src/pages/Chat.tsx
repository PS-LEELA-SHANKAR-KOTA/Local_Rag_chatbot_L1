import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Sparkles, 
  ShieldAlert, 
  FileText,
  Loader2,
  Trash2,
  Paperclip,
  ArrowRight,
  Copy,
  RefreshCw,
  XSquare
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "../store/chatStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { api } from "../services/api";
import { useNotificationStore } from "../store/notificationStore";

export const Chat: React.FC = () => {
  const { activeWorkspace } = useWorkspaceStore();
  const { 
    messages, 
    isStreaming, 
    streamingText, 
    streamingReasoning,
    streamingCitations, 
    streamingConfidence, 
    streamingStats,
    error,
    sendMessage,
    stopStreaming,
    createConversation,
    activeConversation,
    fetchConversations,
    deleteMessage,
    setActiveCitation
  } = useChatStore();

  const { addNotification } = useNotificationStore();

  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streamingReasoning, isStreaming]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeWorkspace) return;

    // Ensure we have an active conversation
    let currentConv = activeConversation;
    if (!currentConv) {
      try {
        currentConv = await createConversation(activeWorkspace.id, `Chat - ${input.slice(0, 20)}...`);
        if (activeWorkspace) {
          fetchConversations(activeWorkspace.id);
        }
      } catch (err) {
        console.error("Failed to auto-create conversation", err);
        return;
      }
    }

    if (imageFile) {
      // Vision Analysis Mode
      setIsVisionAnalyzing(true);
      const queryText = input.trim() || "Analyze this image and describe it.";
      
      // Clear inputs
      setInput("");
      setImageFile(null);
      setImagePreviewUrl(null);
      
      addNotification({
        type: "info",
        title: "Vision Model Triggered",
        message: "Sending file to local Qwen2.5-VL vision model..."
      });

      try {
        const res = await api.analyzeImage(imageFile, queryText);
        addNotification({
          type: "success",
          title: "Vision Analysis Complete",
          message: "Vision results loaded. Starting contextual discussion..."
        });
        await sendMessage(`${queryText} [Visual Analysis Attached: ${res.analysis}]`);
      } catch (err) {
        addNotification({
          type: "error",
          title: "Vision OCR failed",
          message: "Ensure Ollama vision model is active on port 11434."
        });
        console.error("Vision analyze failed", err);
      } finally {
        setIsVisionAnalyzing(false);
      }
    } else {
      if (!input.trim()) return;
      const query = input;
      setInput("");
      await sendMessage(query);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      addNotification({
        type: "info",
        title: "Image Attached",
        message: `${file.name} is ready for vision modeling.`
      });
    }
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSuggestionClick = (question: string) => {
    setInput(question);
  };

  // Hover Message Actions handlers
  const copyMessageToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({
      type: "success",
      title: "Copied to Clipboard",
      message: "Message content copied successfully."
    });
  };

  const deleteChatMessage = async (msgId: string) => {
    if (confirm("Delete this message?")) {
      await deleteMessage(msgId);
      addNotification({
        type: "success",
        title: "Message Deleted",
        message: "Target message removed from chat history."
      });
    }
  };

  const regenerateResponse = async (msgIndex: number) => {
    // Locate the user question immediately preceding this message
    const prevMsg = messages[msgIndex - 1];
    if (prevMsg && prevMsg.role === "user") {
      addNotification({
        type: "info",
        title: "Regenerating",
        message: "Requesting new completion response from Ollama Llama..."
      });
      // Delete old interaction pair to prevent duplicates
      await deleteMessage(messages[msgIndex].id);
      await deleteMessage(prevMsg.id);
      await sendMessage(prevMsg.content);
    }
  };

  // Quick Action chips
  const applyQuickAction = (action: "summarize" | "explain" | "translate" | "compare") => {
    if (!activeWorkspace) return;
    
    let queryPrefix = "";
    if (action === "summarize") {
      queryPrefix = "Provide a high-level summary of the key findings in the documents.";
    } else if (action === "explain") {
      queryPrefix = "Explain this concept in simple terms: ";
    } else if (action === "translate") {
      queryPrefix = "Translate this text or findings to Hindi: ";
    } else if (action === "compare") {
      queryPrefix = "Compare the data and find discrepancies between: ";
    }

    setInput((prev) => prev ? `${queryPrefix}\n${prev}` : queryPrefix);
  };

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto">
            <div className="p-4 rounded-full bg-blue-500/10 text-blue-400">
              <Sparkles className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Ask anything about your documents</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Choose a workspace, upload PDFs, spreadsheets, or images, and start discussing. Llama 3.2 will answer with exact page citations and confidence stats.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-md pt-4">
              <button 
                onClick={() => setInput("What are the key points in the uploaded files?")}
                className="p-3 text-left rounded-xl border border-border bg-card hover:bg-white/5 text-xs text-muted-foreground hover:text-white transition-all cursor-pointer"
              >
                Summarize uploads
              </button>
              <button 
                onClick={() => setInput("Find any conflicting information in the documents.")}
                className="p-3 text-left rounded-xl border border-border bg-card hover:bg-white/5 text-xs text-muted-foreground hover:text-white transition-all cursor-pointer"
              >
                Analyze discrepancies
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, idx) => (
              <div 
                key={msg.id} 
                className={`flex flex-col space-y-2 fade-in group relative ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {/* Role Header */}
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">
                  {msg.role === "user" ? "You" : "Local AI Assistant"}
                </span>

                {/* Message Bubble Container with Action Hover HUD */}
                <div className="relative max-w-full group">
                  
                  {/* Action HUD Panel (Floating on hover) */}
                  <div className={`absolute -top-3 right-2 bg-card border border-border rounded-lg shadow-xl px-1.5 py-0.5 z-10 flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto`}>
                    <button
                      onClick={() => copyMessageToClipboard(msg.content)}
                      className="p-1 rounded text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                      title="Copy response text"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {msg.role === "assistant" && idx > 0 && (
                      <button
                        onClick={() => regenerateResponse(idx)}
                        className="p-1 rounded text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        title="Regenerate this response"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteChatMessage(msg.id)}
                      className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                      title="Delete message from history"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Text bubble */}
                  <div 
                    className={`p-4 rounded-2xl text-sm leading-relaxed border ${
                      msg.role === "user" 
                        ? "bg-blue-500/10 border-blue-500/20 text-white" 
                        : "bg-card border-border text-foreground"
                    }`}
                  >
                    {/* Collapsible Reasoning Block */}
                    {msg.role === "assistant" && msg.reasoning && (
                      <details className="mb-3 text-xs border border-border bg-white/5 rounded-lg overflow-hidden">
                        <summary className="p-2 cursor-pointer font-semibold text-muted-foreground select-none flex items-center gap-1.5 hover:text-white hover:bg-white/5 transition-colors">
                          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                          <span>Thought Process (Reasoning)</span>
                        </summary>
                        <div className="p-3 border-t border-border/40 text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-black/10">
                          {msg.reasoning}
                        </div>
                      </details>
                    )}

                    {msg.content && (
                      <div className="prose prose-invert max-w-none text-xs md:text-sm space-y-2
                        prose-headings:text-white prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                        prose-a:text-blue-400 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/30 prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto
                        prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-border prose-th:p-2 prose-td:border prose-td:border-border prose-td:p-2">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* Assistant Metadata (Citations, Confidence, Follow-ups, Stats) */}
                    {msg.role === "assistant" && (
                      <div className="mt-4 pt-4 border-t border-border/80 space-y-3">
                        {/* Confidence Score Badge & Stats */}
                        {(msg.confidence_score !== undefined || msg.stats) && (
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2">
                            {msg.confidence_score !== undefined && (
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[10px] text-muted-foreground">Confidence Score:</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  msg.confidence_score >= 8 
                                    ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                                    : msg.confidence_score >= 5
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}>
                                  {msg.confidence_score}/10
                                </span>
                              </div>
                            )}

                            {msg.stats && (
                              <div className="text-[9px] text-muted-foreground/60 flex items-center gap-1.5">
                                <span>⚡ Retrieval: {msg.stats.search_time_seconds}s</span>
                                <span>•</span>
                                <span>⏱️ Generation: {msg.stats.total_api_time_seconds}s</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Citation Chips: Slides right context pane on click */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground font-bold">Sources cited:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.citations.map((cit, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setActiveCitation(cit)}
                                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] text-blue-400 hover:text-white flex items-center space-x-1 transition-colors cursor-pointer"
                                  title="View citation page in right drawer"
                                >
                                  <FileText className="h-3 w-3 flex-shrink-0" />
                                  <span className="max-w-[120px] truncate">{cit.document_name}</span>
                                  <span className="text-muted-foreground/60">(Pg {cit.page_number})</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Follow-up Suggested Questions */}
                        {msg.follow_up_questions && msg.follow_up_questions.length > 0 && (
                          <div className="pt-2">
                            <p className="text-[10px] text-muted-foreground font-bold mb-1">Suggested Follow-ups:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.follow_up_questions.map((q, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSuggestionClick(q)}
                                  className="px-3 py-1.5 rounded-full border border-border bg-white/5 hover:bg-white/10 text-[10px] text-white flex items-center space-x-1 transition-all cursor-pointer"
                                >
                                  <span>{q}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            ))}

            {/* SSE Streaming Assistant Bubble */}
            {isStreaming && (
              <div className="flex flex-col space-y-2 items-start fade-in w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-1">Local AI Assistant (Streaming)</span>
                <div className="p-4 rounded-2xl w-full text-sm leading-relaxed border bg-card border-border text-foreground">
                  
                  {/* Streaming Reasoning block */}
                  {streamingReasoning && (
                    <details open className="mb-3 text-xs border border-border bg-white/5 rounded-lg overflow-hidden">
                      <summary className="p-2 cursor-pointer font-semibold text-muted-foreground select-none flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                        <span>Thinking Process...</span>
                      </summary>
                      <div className="p-3 border-t border-border/40 text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-black/10">
                        {streamingReasoning}
                      </div>
                    </details>
                  )}

                  {streamingText ? (
                    <div className="prose prose-invert max-w-none text-xs md:text-sm space-y-2
                      prose-headings:text-white prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                      prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/30">
                      <ReactMarkdown>
                        {streamingText}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    !streamingReasoning && <div className="flex items-center space-x-2 text-muted-foreground text-xs">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                      <span>Synthesizing response...</span>
                    </div>
                  )}

                  {/* Streaming Citation / Metadata Preview */}
                  {(streamingCitations.length > 0 || streamingConfidence !== null || streamingStats) && (
                    <div className="mt-4 pt-4 border-t border-border/80 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2">
                        {streamingConfidence !== null && (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] text-muted-foreground">Confidence Score:</span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {streamingConfidence}/10
                            </span>
                          </div>
                        )}
                        {streamingStats && (
                          <div className="text-[9px] text-muted-foreground flex items-center gap-1.5">
                            <span>⚡ Retrieval: {streamingStats.search_time_seconds}s</span>
                            <span>•</span>
                            <span>⏱️ Generation: {streamingStats.total_api_time_seconds}s</span>
                          </div>
                        )}
                      </div>
                      
                      {streamingCitations.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground font-bold">Sources cited:</p>
                          <div className="flex flex-wrap gap-1">
                            {streamingCitations.map((cit, idx) => (
                              <span key={idx} className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[9px] text-blue-400 flex items-center space-x-1">
                                <FileText className="h-3 w-3 flex-shrink-0" />
                                <span className="max-w-[100px] truncate">{cit.document_name}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-3 border-t border-red-500/20 bg-red-500/10 text-xs text-red-400 flex items-center space-x-2 max-w-3xl mx-auto w-full mb-2 rounded-lg">
          <ShieldAlert className="h-4.5 w-4.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* INPUT FORM & ACTIONS BAR */}
      <div className="p-4 border-t border-border/60 glass-panel">
        <div className="max-w-3xl mx-auto flex flex-col space-y-2">
          
          {/* File attachment preview */}
          {imagePreviewUrl && (
            <div className="flex items-center space-x-2 p-2 bg-white/5 border border-border rounded-lg w-max relative">
              <img src={imagePreviewUrl} alt="Upload Preview" className="h-10 w-10 object-cover rounded" />
              <div className="text-[10px] pr-8">
                <p className="font-semibold text-white truncate max-w-[120px]">{imageFile?.name}</p>
                <p className="text-muted-foreground">Ready for local Vision analysis</p>
              </div>
              <button 
                onClick={clearImage}
                className="absolute right-1 top-1 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Quick Action prompts list */}
          {activeWorkspace && !isStreaming && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button
                onClick={() => applyQuickAction("summarize")}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-muted-foreground hover:text-white border border-white/5 transition-colors cursor-pointer font-semibold"
              >
                📝 Summarize corpus
              </button>
              <button
                onClick={() => applyQuickAction("explain")}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-muted-foreground hover:text-white border border-white/5 transition-colors cursor-pointer font-semibold"
              >
                💡 Explain concept
              </button>
              <button
                onClick={() => applyQuickAction("translate")}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-muted-foreground hover:text-white border border-white/5 transition-colors cursor-pointer font-semibold"
              >
                🇮🇳 Translate (Hindi)
              </button>
              <button
                onClick={() => applyQuickAction("compare")}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-muted-foreground hover:text-white border border-white/5 transition-colors cursor-pointer font-semibold"
              >
                ⚖️ Compare files
              </button>
            </div>
          )}

          {/* Chat Form panel */}
          <form onSubmit={handleSend} className="flex items-center space-x-2 bg-white/5 border border-border rounded-xl p-2.5 focus-within:border-blue-500 transition-colors">
            {/* Attachment Button */}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/*"
              className="hidden" 
            />
            <button
              type="button"
              disabled={isStreaming || isVisionAnalyzing}
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              title="Upload Image for visual understanding"
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>

            {/* Input field */}
            <input
              type="text"
              placeholder={
                !activeWorkspace 
                  ? "Select a workspace to start chatting..." 
                  : imageFile 
                  ? "Add a visual prompt (e.g. Explain this chart)..." 
                  : "Ask about your documents..."
              }
              disabled={!activeWorkspace || isStreaming || isVisionAnalyzing}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-transparent text-xs sm:text-sm focus:outline-none placeholder:text-muted-foreground/60"
            />

            {/* Action buttons (Streaming or Send) */}
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all cursor-pointer flex items-center space-x-1 text-xs"
                title="Stop generation"
              >
                <XSquare className="h-4 w-4" />
                <span className="hidden sm:inline font-bold">Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={(!input.trim() && !imageFile) || !activeWorkspace || isVisionAnalyzing}
                className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-white/5 text-white disabled:text-muted-foreground transition-all cursor-pointer shadow-lg shadow-blue-500/20"
              >
                {isVisionAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            )}
          </form>
          
          <div className="flex items-center justify-between text-[9px] text-muted-foreground px-1">
            <span>Powered by Llama 3.2 (Text RAG) & Qwen2.5-VL (Vision)</span>
            <span>All operations run locally.</span>
          </div>
        </div>
      </div>

    </div>
  );
};
