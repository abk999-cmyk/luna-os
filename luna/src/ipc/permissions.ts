import { invoke } from '@tauri-apps/api/core';

export type PermissionMode = 'supervised' | 'autonomous' | 'custom';

export async function getPermissionMode(): Promise<PermissionMode> {
  return invoke('get_permission_mode');
}

export async function setPermissionMode(mode: PermissionMode): Promise<void> {
  return invoke('set_permission_mode', { mode });
}
