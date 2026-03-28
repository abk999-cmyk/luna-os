import { invoke } from '@tauri-apps/api/core';

export interface UndoEntry {
  id: string;
  action_id: string;
  action_type: string;
  agent_id: string;
  inverse_operation: unknown;
  created_at: number;
  executed: boolean;
}

export interface UndoResult {
  undone: boolean;
  entry?: UndoEntry;
  reason?: string;
}

export async function undoLastAction(): Promise<UndoResult> {
  return invoke('undo_last_action');
}

export async function getUndoHistory(limit?: number): Promise<UndoEntry[]> {
  return invoke('get_undo_history', { limit: limit ?? 20 });
}
