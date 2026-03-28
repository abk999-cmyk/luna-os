import { create } from 'zustand';

export interface ContextItem {
  id: string;
  filename: string;
  type: string;
  size: number;
  content: string;
  preview?: string;
}

type SidebarTab = 'chat' | 'activity' | 'history';

interface ShellStore {
  topBarHeight: number;
  dockHeight: number;

  missionControlOpen: boolean;
  toggleMissionControl: () => void;
  setMissionControlOpen: (open: boolean) => void;

  contextTrayItems: ContextItem[];
  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  clearContextItems: () => void;

  permissionMode: 'supervised' | 'autonomous' | 'custom';
  setPermissionMode: (mode: 'supervised' | 'autonomous' | 'custom') => void;

  // Unified sidebar (replaces separate panel toggles)
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Legacy — kept for backward compat during transition
  undoTimelineOpen: boolean;
  toggleUndoTimeline: () => void;

  taskListOpen: boolean;
  toggleTaskList: () => void;

  workspaceBrowserOpen: boolean;
  setWorkspaceBrowserOpen: (open: boolean) => void;

  settingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;

  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useShellStore = create<ShellStore>((set) => ({
  topBarHeight: 32,
  dockHeight: 56,

  missionControlOpen: false,
  toggleMissionControl: () => set((s) => ({ missionControlOpen: !s.missionControlOpen })),
  setMissionControlOpen: (open) => set({ missionControlOpen: open }),

  contextTrayItems: [],
  addContextItem: (item) =>
    set((s) => {
      if (s.contextTrayItems.length >= 10) return s;
      return { contextTrayItems: [...s.contextTrayItems, item] };
    }),
  removeContextItem: (id) =>
    set((s) => ({ contextTrayItems: s.contextTrayItems.filter((i) => i.id !== id) })),
  clearContextItems: () => set({ contextTrayItems: [] }),

  permissionMode: 'supervised',
  setPermissionMode: (mode) => set({ permissionMode: mode }),

  sidebarTab: 'chat',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  undoTimelineOpen: false,
  toggleUndoTimeline: () => set((s) => ({ undoTimelineOpen: !s.undoTimelineOpen })),

  taskListOpen: false,
  toggleTaskList: () => set((s) => ({ taskListOpen: !s.taskListOpen })),

  workspaceBrowserOpen: false,
  setWorkspaceBrowserOpen: (open) => set({ workspaceBrowserOpen: open }),

  settingsOpen: false,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),

  theme: 'system',
  setTheme: (theme) => set({ theme }),
}));
