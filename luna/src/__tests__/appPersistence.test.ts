import { describe, it, expect, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { loadActiveApps } from '../ipc/apps';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('app persistence IPC', () => {
  it('calls load_active_apps with correct command', async () => {
    const mockApps = [
      { app_id: 'app-1', window_id: 'win-1', descriptor_json: '{}', data_context_json: '{}', created_at: Date.now() },
    ];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockApps);
    const result = await loadActiveApps();
    expect(invoke).toHaveBeenCalledWith('load_active_apps');
    expect(result).toEqual(mockApps);
  });
});
