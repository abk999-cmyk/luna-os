import { invoke } from '@tauri-apps/api/core';
import type { Plan } from '../stores/taskStore';

export async function createPlan(
  goal: string,
  title?: string,
): Promise<Plan> {
  return invoke('create_plan', {
    goal,
    title: title ?? null,
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
    title?: string;
    goal?: string;
    status?: string;
  },
): Promise<Plan> {
  return invoke('update_plan', {
    planId,
    title: updates.title ?? null,
    goal: updates.goal ?? null,
    status: updates.status ?? null,
  });
}
