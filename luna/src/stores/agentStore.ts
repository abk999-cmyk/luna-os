import { create } from 'zustand';

export type AgentStatus = 'idle' | 'working' | 'streaming' | 'error' | 'success';

export interface ChatMessageAction {
  id: string;
  type: string;
  action_type: string;
  description: string;
  timestamp: number;
  status: string;
  windowId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  actions?: ChatMessageAction[];
}

export interface SubAgentInfo {
  id: string;
  task: string;
  status: string;
}

interface AgentStore {
  status: AgentStatus;
  hasConductor: boolean;
  lastError: string | null;
  chatMessages: ChatMessage[];

  // Streaming state
  streamingTokens: string;
  streamingStartTime: number | null;
  activeSubAgents: SubAgentInfo[];
  streamingActions: ChatMessageAction[];

  setStatus: (status: AgentStatus) => void;
  setHasConductor: (has: boolean) => void;
  setError: (error: string) => void;
  clearError: () => void;
  addChatMessage: (role: 'user' | 'assistant', text: string) => void;
  clearChat: () => void;

  // Streaming methods
  appendStreamToken: (token: string) => void;
  addStreamingAction: (action: ChatMessageAction) => void;
  clearStreamingTokens: () => void;
  finalizeStream: () => void;

  // Sub-agent tracking
  addSubAgent: (agent: SubAgentInfo) => void;
  updateSubAgent: (id: string, status: string) => void;
  clearSubAgents: () => void;
}

let msgCounter = 0;

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: 'idle',
  hasConductor: false,
  lastError: null,
  chatMessages: [],
  streamingTokens: '',
  streamingStartTime: null,
  activeSubAgents: [],
  streamingActions: [],

  setStatus: (status) => set({ status }),
  setHasConductor: (has) => set({ hasConductor: has }),
  setError: (error) => set({ lastError: error, status: 'error' }),
  clearError: () => set({ lastError: null }),
  addChatMessage: (role, text) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id: `msg-${++msgCounter}`, role, text, timestamp: Date.now() },
      ],
    })),
  clearChat: () => set({ chatMessages: [] }),

  appendStreamToken: (token) =>
    set((state) => ({
      streamingTokens: state.streamingTokens + token,
      streamingStartTime: state.streamingStartTime ?? Date.now(),
    })),

  addStreamingAction: (action) =>
    set((state) => ({
      streamingActions: [...state.streamingActions, action],
    })),

  clearStreamingTokens: () =>
    set({ streamingTokens: '', streamingStartTime: null, streamingActions: [] }),

  finalizeStream: () => {
    const { streamingTokens, streamingActions } = get();
    if (streamingTokens.trim()) {
      const msg: ChatMessage = {
        id: `msg-${++msgCounter}`,
        role: 'assistant',
        text: streamingTokens,
        timestamp: Date.now(),
        actions: streamingActions.length > 0 ? [...streamingActions] : undefined,
      };
      set((state) => ({
        chatMessages: [...state.chatMessages, msg],
      }));
    }
    set({ streamingTokens: '', streamingStartTime: null, activeSubAgents: [], streamingActions: [] });
  },

  addSubAgent: (agent) =>
    set((state) => ({
      activeSubAgents: [...state.activeSubAgents.filter((a) => a.id !== agent.id), agent],
    })),

  updateSubAgent: (id, status) =>
    set((state) => ({
      activeSubAgents: state.activeSubAgents.map((a) =>
        a.id === id ? { ...a, status } : a
      ),
    })),

  clearSubAgents: () => set({ activeSubAgents: [] }),
}));
