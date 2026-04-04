import { describe, it, expect, vi } from 'vitest';
import { lunaClipCopy, lunaClipPaste, lunaClipHas } from '../services/clipboard';

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

describe('clipboard service', () => {
  it('copies and pastes text', () => {
    lunaClipCopy('text', 'hello', 'test-app');
    const clip = lunaClipPaste();
    expect(clip?.type).toBe('text');
    expect(clip?.data).toBe('hello');
    expect(clip?.source).toBe('test-app');
  });

  it('lunaClipHas returns true after copy', () => {
    lunaClipCopy('json', { key: 'value' }, 'test');
    expect(lunaClipHas()).toBe(true);
  });

  it('copies to system clipboard', () => {
    lunaClipCopy('text', 'system copy', 'test');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('system copy');
  });
});
