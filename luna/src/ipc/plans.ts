import { invoke } from '@tauri-apps/api/core';
import type { Plan } from '../stores/taskStore';

export async function createPlan(
  name: string,
  goal: string,
  steps?: string[],
): Promise<Plan> {
  return invoke('create_plan', {
    name,
    goal,
    steps: steps ?? [],
  });
}

export async function getPlan(planId: string): Promise<Plan | null> {
  return invoke('get_plan', { planId });
}

export async function listActivePlans(): Promise<Plan[]> {
  return invoke('list_active_plans');
}

export async function updatePlan(
  planId: string,
  updates: {
    steps?: string[];
    status?: string;
  },
): Promise<Plan> {
  return invoke('update_plan', {
    planId,
    steps: updates.steps ?? null,
    status: updates.status ?? null,
  });
}
