import { invoke } from '@tauri-apps/api/core';

export async function sendMessage(text: string): Promise<void> {
  return invoke('send_message', { text });
}

export async function sendMessageStreaming(text: string): Promise<void> {
  return invoke('send_message_streaming', { text });
}

export async function getAgentStatus(): Promise<{
  has_conductor: boolean;
  conductor_id: string | null;
}> {
  return invoke('get_agent_status');
}
