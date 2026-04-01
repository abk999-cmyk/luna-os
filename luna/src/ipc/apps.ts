import { invoke } from '@tauri-apps/api/core';

export interface PersistedApp {
  app_id: string;
  window_id: string;
  controlling_agent_id: string;
  descriptor_json: string;
  data_context_json: string;
  created_at: number;
}

export async function loadActiveApps(): Promise<PersistedApp[]> {
  return invoke('load_active_apps');
}
