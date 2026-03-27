import { create } from 'zustand';
import { getTaskGraph, type TaskNode } from '../ipc/tasks';

// === Plan types ===

export interface PlanTask {
  id: string;
  description: string;
  status: 'draft' | 'active' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  agent_id?: string;
  dependencies: string[];
  effort_estimate?: string;
  risks: string[];
  notes: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  tasks: PlanTask[];
  status: string;
  order: number;
}

export interface Plan {
  id: string;
  title: string;
  goal: string;
  phases: PlanPhase[];
  status: string;
  version: number;
  created_at: number;
  updated_at: number;
}

// === Store ===

interface TaskStore {
  // Task graph (existing)
  tasks: TaskNode[];
  isLoading: boolean;
  loadTasks: () => Promise<void>;
  updateTask: (task: TaskNode) => void;
  clearTasks: () => void;

  // Plans
  plans: Plan[];
  activePlanId: string | null;
  setPlans: (plans: Plan[]) => void;
  addPlan: (plan: Plan) => void;
  removePlan: (planId: string) => void;
  setActivePlan: (planId: string | null) => void;
  updateTaskStatus: (planId: string, taskId: string, status: string) => void;
  updatePlan: (plan: Plan) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  // Task graph state
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

  // Plan state
  plans: [],
  activePlanId: null,

  setPlans: (plans) => set({ plans }),

  addPlan: (plan) => set((state) => ({ plans: [...state.plans, plan] })),

  removePlan: (planId) =>
    set((state) => ({
      plans: state.plans.filter((p) => p.id !== planId),
      activePlanId: state.activePlanId === planId ? null : state.activePlanId,
    })),

  setActivePlan: (planId) => set({ activePlanId: planId }),

  updateTaskStatus: (planId, taskId, status) =>
    set((state) => ({
      plans: state.plans.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          phases: plan.phases.map((phase) => ({
            ...phase,
            tasks: phase.tasks.map((task) =>
              task.id === taskId ? { ...task, status: status as PlanTask['status'] } : task
            ),
          })),
        };
      }),
    })),

  updatePlan: (updatedPlan) =>
    set((state) => ({
      plans: state.plans.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)),
    })),
}));
