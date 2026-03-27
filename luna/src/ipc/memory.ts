import { invoke } from '@tauri-apps/api/core';

// --- Episodic memory ---

export async function queryEpisodicByAgent(
  agentId: string,
  limit?: number,
): Promise<unknown[]> {
  return invoke('query_episodic_by_agent', {
    agentId,
    limit: limit ?? 50,
  });
}

export async function queryEpisodicTimeRange(
  startTime: number,
  endTime: number,
  limit?: number,
): Promise<unknown[]> {
  return invoke('query_episodic_time_range', {
    startTime,
    endTime,
    limit: limit ?? 50,
  });
}

// --- Semantic memory ---

export interface SemanticEntry {
  key: string;
  value: string;
  tags: string[];
}

export async function searchSemanticMemory(
  tag: string,
): Promise<SemanticEntry[]> {
  return invoke('search_semantic_memory', { tag });
}

export async function deleteSemanticMemory(key: string): Promise<void> {
  return invoke('delete_semantic_memory', { key });
}
