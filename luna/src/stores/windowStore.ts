import { create } from 'zustand';
import type { WindowState } from '../types/window';
import * as windowIpc from '../ipc/windows';

interface WindowStore {
  windows: WindowState[];
  focusedWindowId: string | null;

  // Actions
  loadWindows: () => Promise<void>;
  addWindow: (title: string, contentType?: string, content?: string) => Promise<WindowState>;
  removeWindow: (id: string) => Promise<void>;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number) => void;
  syncWindowPosition: (id: string, x: number, y: number) => Promise<void>;
  syncWindowSize: (id: string, width: number, height: number) => Promise<void>;
  minimizeWindow: (id: string) => Promise<void>;
  restoreWindow: (id: string) => Promise<void>;
  focusWindow: (id: string) => Promise<void>;
  unfocusAll: () => void;

  // Content management (kept in frontend for Sprint 1)
  windowContent: Map<string, string>;
  setWindowContent: (id: string, content: string) => void;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  focusedWindowId: null,
  windowContent: new Map(),

  loadWindows: async () => {
    const windows = await windowIpc.getWindows();
    set({ windows });
  },

  addWindow: async (title: string, contentType?: string, content?: string) => {
    const window = await windowIpc.createWindow(title, undefined, undefined, undefined, undefined, contentType);
    set((state) => ({
      windows: [...state.windows, window],
      focusedWindowId: window.id,
    }));
    if (content) {
      get().setWindowContent(window.id, content);
    }
    return window;
  },

  removeWindow: async (id: string) => {
    await windowIpc.closeWindow(id);
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
      focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
    }));
    // Clean up content
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

  // Sync to backend after drag ends
  syncWindowPosition: async (id: string, x: number, y: number) => {
    await windowIpc.moveWindow(id, x, y);
  },

  // Sync to backend after resize ends
  syncWindowSize: async (id: string, width: number, height: number) => {
    await windowIpc.resizeWindow(id, width, height);
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

  setWindowContent: (id: string, content: string) => {
    const newContent = new Map(get().windowContent);
    newContent.set(id, content);
    set({ windowContent: newContent });
  },
}));
