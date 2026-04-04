import { create } from 'zustand';
import type { WindowState } from '../types/window';
import * as windowIpc from '../ipc/windows';
import { useAppStore } from './appStore';
import { saveAppContent, loadAppContent } from '../ipc/persistence';

interface WindowStore {
  windows: WindowState[];
  focusedWindowId: string | null;

  // Actions
  loadWindows: () => Promise<void>;
  addWindow: (title: string, contentType?: string, content?: string, x?: number, y?: number, width?: number, height?: number) => Promise<WindowState>;
  removeWindow: (id: string) => Promise<void>;
  removeWindowLocal: (id: string) => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number) => void;
  syncWindowPosition: (id: string, x: number, y: number) => Promise<void>;
  syncWindowSize: (id: string, width: number, height: number) => Promise<void>;
  minimizeWindow: (id: string) => Promise<void>;
  restoreWindow: (id: string) => Promise<void>;
  focusWindow: (id: string) => Promise<void>;
  unfocusAll: () => void;

  // Add a window locally (no IPC — used when backend already created the window)
  addWindowLocal: (window: WindowState) => void;

  // Content management (kept in frontend for Sprint 1)
  windowContent: Map<string, string>;
  setWindowContent: (id: string, content: string) => void;
  loadPersistedContent: (contentType: string) => Promise<void>;

  // Window groups (magnetic layout)
  windowGroups: Map<string, Set<string>>;
  getWindowGroup: (windowId: string) => Set<string> | null;
  joinWindows: (windowA: string, windowB: string) => void;
  detachWindow: (windowId: string) => void;
}

// Dedup map: title+contentType → timestamp (prevents duplicate window creation)
const _windowDedupMap = new Map<string, number>();
const DEDUP_WINDOW_MS = 500;

// Debounced persistence save timers
const _persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PERSIST_DEBOUNCE_MS = 2000;

function debouncedPersist(windowId: string, contentType: string, content: string) {
  const existing = _persistTimers.get(windowId);
  if (existing) clearTimeout(existing);
  _persistTimers.set(windowId, setTimeout(() => {
    _persistTimers.delete(windowId);
    saveAppContent(contentType, windowId, content).catch(() => {});
  }, PERSIST_DEBOUNCE_MS));
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  focusedWindowId: null,
  windowContent: new Map(),
  windowGroups: new Map(),

  loadWindows: async () => {
    const windows = await windowIpc.getWindows();
    // Clamp window bounds to viewport
    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const clamped = windows.map(w => ({
      ...w,
      bounds: {
        ...w.bounds,
        x: Math.max(0, Math.min(w.bounds.x, vw - 100)),
        y: Math.max(0, Math.min(w.bounds.y, vh - 100)),
        width: Math.max(320, Math.min(w.bounds.width, vw)),
        height: Math.max(240, Math.min(w.bounds.height, vh)),
      },
    }));
    set({ windows: clamped });
  },

  addWindow: async (title: string, contentType?: string, content?: string, x?: number, y?: number, width?: number, height?: number) => {
    // Dedup guard: skip if same title+contentType was added within dedup window
    const dedupKey = `${title}::${contentType || 'panel'}`;
    const now = Date.now();
    const lastTime = _windowDedupMap.get(dedupKey);
    if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
      // Return a dummy window state to avoid breaking callers
      const existing = get().windows[get().windows.length - 1];
      if (existing) return existing;
    }
    _windowDedupMap.set(dedupKey, now);

    const window = await windowIpc.createWindow(title, width, height, x, y, contentType);
    // H8: Unfocus all existing windows before adding new focused window
    set((state) => ({
      windows: [...state.windows.map((w) => ({ ...w, focused: false })), { ...window, focused: true }],
      focusedWindowId: window.id,
    }));
    if (content) {
      get().setWindowContent(window.id, content);
    }
    return window;
  },

  removeWindow: async (id: string) => {
    // H9: Clean up magnetic groups before removing
    get().detachWindow(id);
    // H9: Clean up app state if this window hosts an app
    const appInfo = useAppStore.getState().getAppByWindowId(id);
    if (appInfo) {
      useAppStore.getState().destroyApp(appInfo.appId);
    }

    try {
      await windowIpc.closeWindow(id);
    } catch (_err) {
      // Backend close may fail; always proceed with local cleanup
    }
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
      focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
    }));
    // Clean up content
    const content = new Map(get().windowContent);
    content.delete(id);
    set({ windowContent: content });
  },

  removeWindowLocal: (id: string) => {
    // Local-only cleanup (no backend IPC) — used when backend already closed the window
    get().detachWindow(id);
    const appInfo = useAppStore.getState().getAppByWindowId(id);
    if (appInfo) {
      useAppStore.getState().destroyApp(appInfo.appId);
    }
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
      focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
    }));
    const content = new Map(get().windowContent);
    content.delete(id);
    set({ windowContent: content });
  },

  // Optimistic local update (no IPC, for smooth dragging)
  updateWindowPosition: (id: string, x: number, y: number) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, bounds: { ...w.bounds, x, y } } : w
      ),
    }));
  },

  // Optimistic local update (no IPC, for smooth resizing)
  updateWindowSize: (id: string, width: number, height: number) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, bounds: { ...w.bounds, width: Math.max(320, width), height: Math.max(240, height) } }
          : w
      ),
    }));
  },

  // Sync to backend after drag ends — use authoritative return value
  syncWindowPosition: async (id: string, x: number, y: number) => {
    const result = await windowIpc.moveWindow(id, x, y);
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, bounds: { ...w.bounds, x: result.bounds.x, y: result.bounds.y } } : w
      ),
    }));
  },

  // Sync to backend after resize ends — use authoritative return value
  syncWindowSize: async (id: string, width: number, height: number) => {
    const result = await windowIpc.resizeWindow(id, width, height);
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, bounds: { ...w.bounds, width: result.bounds.width, height: result.bounds.height } } : w
      ),
    }));
  },

  minimizeWindow: async (id: string) => {
    await windowIpc.minimizeWindow(id);
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, visibility: 'minimized' as const, focused: false } : w
      ),
      focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
    }));
  },

  restoreWindow: async (id: string) => {
    await windowIpc.restoreWindow(id);
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, visibility: 'visible' as const } : w
      ),
    }));
  },

  focusWindow: async (id: string) => {
    const result = await windowIpc.focusWindow(id);
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, focused: true, z_order: result.z_order, visibility: 'visible' as const }
          : { ...w, focused: false }
      ),
      focusedWindowId: id,
    }));
  },

  unfocusAll: () => {
    set((state) => ({
      windows: state.windows.map((w) => ({ ...w, focused: false })),
      focusedWindowId: null,
    }));
  },

  addWindowLocal: (window: WindowState) => {
    // H8: Unfocus all existing windows before adding new focused window
    set((state) => ({
      windows: [...state.windows.map((w) => ({ ...w, focused: false })), { ...window, focused: true }],
      focusedWindowId: window.id,
    }));
  },

  setWindowContent: (id: string, content: string) => {
    const newContent = new Map(get().windowContent);
    newContent.set(id, content);
    set({ windowContent: newContent });
    // Persist content if window has a content_type
    const win = get().windows.find(w => w.id === id);
    if (win && win.content_type) {
      debouncedPersist(id, win.content_type, content);
    }
  },

  loadPersistedContent: async (contentType: string) => {
    try {
      const entries = await loadAppContent(contentType);
      if (entries.length > 0) {
        const newContent = new Map(get().windowContent);
        for (const [key, json] of entries) {
          newContent.set(key, json);
        }
        set({ windowContent: newContent });
      }
    } catch {
      // Persistence not available yet
    }
  },

  getWindowGroup: (windowId: string): Set<string> | null => {
    const groups = get().windowGroups;
    for (const [, members] of groups) {
      if (members.has(windowId)) return members;
    }
    return null;
  },

  joinWindows: (windowA: string, windowB: string) => {
    const groups = new Map(get().windowGroups);
    let groupA: string | null = null;
    let groupB: string | null = null;

    for (const [gid, members] of groups) {
      if (members.has(windowA)) groupA = gid;
      if (members.has(windowB)) groupB = gid;
    }

    if (groupA && groupB && groupA === groupB) return; // Already in same group

    if (groupA && groupB) {
      // Merge groupB into groupA
      const membersB = groups.get(groupB)!;
      const membersA = new Set(groups.get(groupA)!);
      for (const m of membersB) membersA.add(m);
      groups.set(groupA, membersA);
      groups.delete(groupB);
    } else if (groupA) {
      const members = new Set(groups.get(groupA)!);
      members.add(windowB);
      groups.set(groupA, members);
    } else if (groupB) {
      const members = new Set(groups.get(groupB)!);
      members.add(windowA);
      groups.set(groupB, members);
    } else {
      // New group
      const groupId = `group-${Date.now()}`;
      groups.set(groupId, new Set([windowA, windowB]));
    }

    set({ windowGroups: groups });
  },

  detachWindow: (windowId: string) => {
    const groups = new Map(get().windowGroups);
    for (const [gid, members] of groups) {
      if (members.has(windowId)) {
        const newMembers = new Set(members);
        newMembers.delete(windowId);
        if (newMembers.size <= 1) {
          groups.delete(gid); // Dissolve group with 0-1 members
        } else {
          groups.set(gid, newMembers);
        }
        break;
      }
    }
    set({ windowGroups: groups });
  },
}));
