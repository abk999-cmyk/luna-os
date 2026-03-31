import { describe, it, expect, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { saveAppContent, loadAppContent, deleteAppContent } from '../ipc/persistence';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('persistence IPC', () => {
  it('calls save_app_content with correct params', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    await saveAppContent('notes', 'win-123', '{"notes":[]}');
    expect(invoke).toHaveBeenCalledWith('save_app_content', {
      contentType: 'notes',
      contentKey: 'win-123',
      contentJson: '{"notes":[]}',
    });
  });

  it('calls load_app_content with correct params', async () => {
    const mockData: [string, string][] = [['win-1', '{}']];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockData);
    const result = await loadAppContent('calendar');
    expect(invoke).toHaveBeenCalledWith('load_app_content', { contentType: 'calendar' });
    expect(result).toEqual(mockData);
  });

  it('calls delete_app_content with correct params', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    await deleteAppContent('todo', 'win-456');
    expect(invoke).toHaveBeenCalledWith('delete_app_content', {
      contentType: 'todo',
      contentKey: 'win-456',
    });
  });
});
