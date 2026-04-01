import { invoke } from '@tauri-apps/api/core';

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number; // MB
  status: string;
}

export interface SystemInfo {
  cpu_usage: number;
  total_memory: number; // MB
  used_memory: number;  // MB
  process_count: number;
  processes: ProcessInfo[];
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke('get_system_info');
}
