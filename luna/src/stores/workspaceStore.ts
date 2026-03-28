import { create } from 'zustand';
import {
  Workspace,
  listWorkspaces,
  createWorkspace as ipcCreate,
  switchWorkspace as ipcSwitch,
  deleteWorkspace as ipcDelete,
  updateWorkspace as ipcUpdate,
  getActiveWorkspace,
} from '../ipc/workspace';

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;

  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, goal?: string, isolationLevel?: string) => Promise<Workspace>;
  switchWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspace: (id: string, updates: { name?: string; goal?: string }) => Promise<void>;
  setActiveWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const [workspaces, activeId] = await Promise.all([
        listWorkspaces(),
        getActiveWorkspace(),
      ]);
      set({ workspaces, activeWorkspaceId: activeId, isLoading: false });
    } catch (e) {
      console.error('Failed to load workspaces:', e);
      set({ isLoading: false });
    }
  },

  createWorkspace: async (name, goal, isolationLevel) => {
    const ws = await ipcCreate(name, goal, isolationLevel);
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
    return ws;
  },

  switchWorkspace: async (id) => {
    await ipcSwitch(id);
    set({ activeWorkspaceId: id });
  },

  deleteWorkspace: async (id) => {
    await ipcDelete(id);
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
    }));
  },

  updateWorkspace: async (id, updates) => {
    await ipcUpdate(id, updates);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id
          ? { ...w, ...(updates.name && { name: updates.name }), ...(updates.goal && { goal: updates.goal }) }
          : w
      ),
    }));
  },

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
}));
