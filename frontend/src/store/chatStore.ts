import { create } from "zustand";
import { api, type Conversation, type Message, type Citation, type Document } from "../services/api";

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  streamingText: string;
  streamingReasoning: string;
  streamingCitations: Citation[];
  streamingConfidence: number | null;
  streamingFollowUps: string[];
  streamingStats: any | null;
  isLoading: boolean;
  error: string | null;
  activeEventSource: EventSource | null;

  // Context Pane States
  activeCitation: Citation | null;
  selectedFileForPreview: Document | null;
  isContextPaneOpen: boolean;

  fetchConversations: (workspaceId: string) => Promise<void>;
  setActiveConversation: (conversation: Conversation | null) => void;
  createConversation: (workspaceId: string, title?: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (query: string) => Promise<void>;
  stopStreaming: () => void;
  deleteMessage: (id: string) => Promise<void>;
  
  // Context Pane Actions
  setActiveCitation: (citation: Citation | null) => void;
  setSelectedFileForPreview: (file: Document | null) => void;
  setContextPaneOpen: (isOpen: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isStreaming: false,
  streamingText: "",
  streamingReasoning: "",
  streamingCitations: [],
  streamingConfidence: null,
  streamingFollowUps: [],
  streamingStats: null,
  isLoading: false,
  error: null,
  activeEventSource: null,

  // Context Pane Initial States
  activeCitation: null,
  selectedFileForPreview: null,
  isContextPaneOpen: false,

  fetchConversations: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await api.listConversations(workspaceId);
      set({ conversations, isLoading: false });
    } catch (err: any) {
      set({ error: "Failed to fetch conversations", isLoading: false });
    }
  },

  setActiveConversation: (conversation) => {
    set({ activeConversation: conversation, messages: [], error: null });
    if (conversation) {
      get().fetchMessages(conversation.id);
    }
  },

  createConversation: async (workspaceId, title) => {
    set({ isLoading: true, error: null });
    try {
      const newConv = await api.createConversation(workspaceId, title);
      set(state => ({
        conversations: [newConv, ...state.conversations],
        activeConversation: newConv,
        messages: [],
        isLoading: false
      }));
      return newConv;
    } catch (err: any) {
      set({ error: "Failed to create chat session", isLoading: false });
      throw err;
    }
  },

  deleteConversation: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteConversation(id);
      const updated = get().conversations.filter(c => c.id !== id);
      set({ conversations: updated, isLoading: false });
      if (get().activeConversation?.id === id) {
        set({ activeConversation: updated.length > 0 ? updated[0] : null });
        if (updated.length > 0) {
          get().fetchMessages(updated[0].id);
        } else {
          set({ messages: [] });
        }
      }
    } catch (err: any) {
      set({ error: "Failed to delete conversation", isLoading: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoading: true, error: null });
    try {
      const messages = await api.getMessages(conversationId);
      set({ messages, isLoading: false });
    } catch (err: any) {
      set({ error: "Failed to fetch messages", isLoading: false });
    }
  },

  sendMessage: async (query) => {
    const conversation = get().activeConversation;
    if (!conversation || !query.trim()) return;

    // 1. Add user message locally for immediate UI update
    const tempUserMessage: Message = {
      id: `temp_user_${Date.now()}`,
      conversation_id: conversation.id,
      role: "user",
      content: query,
      created_at: new Date().toISOString()
    };

    set(state => ({
      messages: [...state.messages, tempUserMessage],
      isStreaming: true,
      streamingText: "",
      streamingReasoning: "",
      streamingCitations: [],
      streamingConfidence: null,
      streamingFollowUps: [],
      streamingStats: null,
      error: null
    }));

    // 2. Open Server-Sent Events stream
    const streamUrl = api.getStreamUrl(conversation.id, query);
    const eventSource = new EventSource(streamUrl);
    set({ activeEventSource: eventSource });

    eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          set(state => ({
            streamingText: state.streamingText + data.text
          }));
        }
      } catch (err) {
        console.error("Error parsing message chunk", err);
      }
    });

    eventSource.addEventListener("reasoning", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          set(state => ({
            streamingReasoning: state.streamingReasoning + data.text
          }));
        }
      } catch (err) {
        console.error("Error parsing reasoning chunk", err);
      }
    });

    eventSource.addEventListener("citations", (event) => {
      try {
        const citations = JSON.parse(event.data);
        set({ streamingCitations: citations });
      } catch (err) {
        console.error("Error parsing citations", err);
      }
    });

    eventSource.addEventListener("confidence", (event) => {
      try {
        const data = JSON.parse(event.data);
        set({ streamingConfidence: data.score });
      } catch (err) {
        console.error("Error parsing confidence score", err);
      }
    });

    eventSource.addEventListener("followups", (event) => {
      try {
        const followUps = JSON.parse(event.data);
        set({ streamingFollowUps: followUps });
      } catch (err) {
        console.error("Error parsing followups", err);
      }
    });

    eventSource.addEventListener("stats", (event) => {
      try {
        const stats = JSON.parse(event.data);
        set({ streamingStats: stats });
      } catch (err) {
        console.error("Error parsing stats", err);
      }
    });

    eventSource.addEventListener("done", async () => {
      eventSource.close();
      
      // Fetch fresh database state of messages
      await get().fetchMessages(conversation.id);
      
      // Reset streaming states
      set({
        isStreaming: false,
        streamingText: "",
        streamingReasoning: "",
        streamingCitations: [],
        streamingConfidence: null,
        streamingFollowUps: [],
        streamingStats: null,
        activeEventSource: null
      });
      
      // Update conversation in list (to refresh timestamps)
      const updatedConvs = get().conversations.map(c => {
        if (c.id === conversation.id) {
          return { ...c, updated_at: new Date().toISOString() };
        }
        return c;
      });
      // Sort conversations by updated_at descending
      set({ conversations: updatedConvs.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) });
    });

    eventSource.addEventListener("fatal_error", (event) => {
      try {
        const data = JSON.parse(event.data);
        console.error("Fatal streaming error from backend:", data);
        set({ error: `Stream Error: ${data.detail || "Unknown error"}` });
      } catch (e) {
        set({ error: "Stream Error: Connection failed." });
      }
      eventSource.close();
      set({
        isStreaming: false,
        activeEventSource: null
      });
    });

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
      set({
        error: "Connection lost or error generated from local Ollama model.",
        isStreaming: false,
        streamingText: "",
        streamingReasoning: "",
        streamingCitations: [],
        streamingConfidence: null,
        streamingFollowUps: [],
        streamingStats: null,
        activeEventSource: null
      });
    };
  },

  stopStreaming: () => {
    const es = get().activeEventSource;
    if (es) {
      es.close();
    }
    set({
      isStreaming: false,
      streamingText: "",
      streamingReasoning: "",
      streamingCitations: [],
      streamingConfidence: null,
      streamingFollowUps: [],
      streamingStats: null,
      activeEventSource: null
    });
  },

  deleteMessage: async (id) => {
    try {
      await api.deleteMessage(id);
      set(state => ({
        messages: state.messages.filter(m => m.id !== id)
      }));
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  },

  // Context Pane Actions implementation
  setActiveCitation: (citation) => {
    set({ activeCitation: citation, selectedFileForPreview: null });
    if (citation) {
      set({ isContextPaneOpen: true });
    }
  },
  setSelectedFileForPreview: (file) => {
    set({ selectedFileForPreview: file, activeCitation: null });
    if (file) {
      set({ isContextPaneOpen: true });
    }
  },
  setContextPaneOpen: (isOpen) => {
    set({ isContextPaneOpen: isOpen });
    if (!isOpen) {
      set({ activeCitation: null, selectedFileForPreview: null });
    }
  }
}));
