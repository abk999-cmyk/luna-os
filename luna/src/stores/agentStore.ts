import { create } from 'zustand';

export type AgentStatus = 'idle' | 'working' | 'streaming' | 'error' | 'success';

interface AgentStore {
  status: AgentStatus;
  hasConductor: boolean;
  lastError: string | null;

  setStatus: (status: AgentStatus) => void;
  setHasConductor: (has: boolean) => void;
  setError: (error: string) => void;
  clearError: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  status: 'idle',
  hasConductor: false,
  lastError: null,

  setStatus: (status) => set({ status }),
  setHasConductor: (has) => set({ hasConductor: has }),
  setError: (error) => set({ lastError: error, status: 'error' }),
  clearError: () => set({ lastError: null }),
}));
