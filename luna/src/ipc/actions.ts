import { invoke } from '@tauri-apps/api/core';
import type { Action } from '../types/action';

export async function dispatchAction(actionType: string, payload: unknown): Promise<string> {
  return invoke('dispatch_action', { actionType, payload });
}

export async function queryActions(actionType?: string, limit?: number): Promise<Action[]> {
  return invoke('query_actions', {
    actionType: actionType ?? null,
    limit: limit ?? null,
  });
}
