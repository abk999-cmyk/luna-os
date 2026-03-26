import { invoke } from '@tauri-apps/api/core';

export interface TaskNode {
  id: string;
  parent_id: string | null;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  agent_id: string;
  created_at: number;
  completed_at: number | null;
  result: unknown | null;
}

export async function getTaskGraph(): Promise<TaskNode[]> {
  return invoke('get_task_graph');
}
