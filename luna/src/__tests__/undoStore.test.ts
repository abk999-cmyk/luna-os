import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUndoStore } from '../stores/undoStore';

describe('undoStore', () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
  });

  it('pushes entries', () => {
    useUndoStore.getState().push('test action', () => {});
    expect(useUndoStore.getState().entries.length).toBe(1);
  });

  it('undoLast calls the undo function', () => {
    const fn = vi.fn();
    useUndoStore.getState().push('test', fn);
    const result = useUndoStore.getState().undoLast();
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalled();
    expect(useUndoStore.getState().entries.length).toBe(0);
  });

  it('undoLast returns false when empty', () => {
    const result = useUndoStore.getState().undoLast();
    expect(result).toBe(false);
  });

  it('limits to 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      useUndoStore.getState().push(`action ${i}`, () => {});
    }
    expect(useUndoStore.getState().entries.length).toBe(50);
  });

  it('clear removes all entries', () => {
    useUndoStore.getState().push('a', () => {});
    useUndoStore.getState().push('b', () => {});
    useUndoStore.getState().clear();
    expect(useUndoStore.getState().entries.length).toBe(0);
  });
});
