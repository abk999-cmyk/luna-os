import { invoke } from '@tauri-apps/api/core';

export interface Workspace {
  id: string;
  name: string;
  goal: string | null;
  window_ids: string[];
  isolation_level: string;
  created_at: number;
  updated_at: number;
}

export async function createWorkspace(
  name: string,
  goal?: string,
  isolationLevel?: string,
): Promise<Workspace> {
  return invoke('create_workspace', {
    name,
    goal: goal ?? null,
    isolationLevel: isolationLevel ?? null,
  });
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return invoke('list_workspaces');
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  return invoke('switch_workspace', { workspaceId });
}

export async function getActiveWorkspace(): Promise<string | null> {
  return invoke('get_active_workspace');
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke('delete_workspace', { workspaceId });
}

export async function updateWorkspace(
  workspaceId: string,
  updates: {
    name?: string;
    goal?: string;
  },
): Promise<void> {
  return invoke('update_workspace', {
    workspaceId,
    name: updates.name ?? null,
    goal: updates.goal ?? null,
  });
}

export async function addWindowToWorkspace(
  workspaceId: string,
  windowId: string,
): Promise<void> {
  return invoke('add_window_to_workspace', { workspaceId, windowId });
}

export async function removeWindowFromWorkspace(
  workspaceId: string,
  windowId: string,
): Promise<void> {
  return invoke('remove_window_from_workspace', { workspaceId, windowId });
}
