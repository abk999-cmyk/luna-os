import { create } from 'zustand';

export type AgentStatus = 'idle' | 'working' | 'streaming' | 'error' | 'success';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface AgentStore {
  status: AgentStatus;
  hasConductor: boolean;
  lastError: string | null;
  chatMessages: ChatMessage[];

  setStatus: (status: AgentStatus) => void;
  setHasConductor: (has: boolean) => void;
  setError: (error: string) => void;
  clearError: () => void;
  addChatMessage: (role: 'user' | 'assistant', text: string) => void;
  clearChat: () => void;
}

let msgCounter = 0;

export const useAgentStore = create<AgentStore>((set) => ({
  status: 'idle',
  hasConductor: false,
  lastError: null,
  chatMessages: [],

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
}));
