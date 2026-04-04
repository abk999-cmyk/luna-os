import { create } from 'zustand';

interface UndoEntry {
  id: string;
  description: string;
  timestamp: number;
  undo: () => void;
}

interface UndoStore {
  entries: UndoEntry[];
  push: (description: string, undoFn: () => void) => void;
  undoLast: () => boolean;
  clear: () => void;
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  entries: [],

  push: (description, undoFn) => {
    const entry: UndoEntry = {
      id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description,
      timestamp: Date.now(),
      undo: undoFn,
    };
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, 50), // Keep max 50
    }));
  },

  undoLast: () => {
    const entries = get().entries;
    if (entries.length === 0) return false;
    const last = entries[0];
    last.undo();
    set((state) => ({
      entries: state.entries.slice(1),
    }));
    return true;
  },

  clear: () => set({ entries: [] }),
}));
