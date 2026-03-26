import { create } from 'zustand';
import { getTaskGraph, type TaskNode } from '../ipc/tasks';

interface TaskStore {
  tasks: TaskNode[];
  isLoading: boolean;

  loadTasks: () => Promise<void>;
  updateTask: (task: TaskNode) => void;
  clearTasks: () => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  isLoading: false,

  loadTasks: async () => {
    set({ isLoading: true });
    try {
      const tasks = await getTaskGraph();
      set({ tasks, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateTask: (task) => {
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const updated = [...state.tasks];
        updated[idx] = task;
        return { tasks: updated };
      }
      return { tasks: [...state.tasks, task] };
    });
  },

  clearTasks: () => set({ tasks: [] }),
}));
