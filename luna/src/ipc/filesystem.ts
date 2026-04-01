import { invoke } from '@tauri-apps/api/core';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string; // ISO 8601
}

export async function listDirectory(path: string): Promise<FsEntry[]> {
  return invoke('list_directory', { path });
}

export async function getHomeDir(): Promise<string> {
  return invoke('get_home_dir');
}
