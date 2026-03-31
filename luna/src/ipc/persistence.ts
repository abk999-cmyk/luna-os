import { invoke } from '@tauri-apps/api/core';

export async function saveAppContent(contentType: string, contentKey: string, contentJson: string): Promise<void> {
  await invoke('save_app_content', { contentType, contentKey, contentJson });
}

export async function loadAppContent(contentType: string): Promise<[string, string][]> {
  return invoke('load_app_content', { contentType });
}

export async function deleteAppContent(contentType: string, contentKey: string): Promise<void> {
  await invoke('delete_app_content', { contentType, contentKey });
}
