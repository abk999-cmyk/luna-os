import { describe, it, expect, beforeEach } from 'vitest';
import { useWindowStore } from '../stores/windowStore';

describe('windowStore snap', () => {
  beforeEach(() => {
    // Reset store
    useWindowStore.setState({ windows: [], focusedWindowId: null });
  });

  it('snapWindow left sets bounds to left half', () => {
    // Add a window first
    useWindowStore.setState({
      windows: [{
        id: 'win-1', title: 'Test', bounds: { x: 100, y: 100, width: 400, height: 300 },
        z_order: 1, visibility: 'visible' as const, focused: true, content_type: 'panel', created_at: new Date().toISOString(),
      }],
    });

    useWindowStore.getState().snapWindow('win-1', 'left');
    const win = useWindowStore.getState().windows.find(w => w.id === 'win-1');
    expect(win?.bounds.x).toBe(0);
    expect(win?.bounds.width).toBeGreaterThan(0);
    expect(win?.bounds.width).toBeLessThan(window.innerWidth);
  });

  it('snapWindow right positions to right half', () => {
    useWindowStore.setState({
      windows: [{
        id: 'win-2', title: 'Test', bounds: { x: 100, y: 100, width: 400, height: 300 },
        z_order: 1, visibility: 'visible' as const, focused: true, content_type: 'panel', created_at: new Date().toISOString(),
      }],
    });

    useWindowStore.getState().snapWindow('win-2', 'right');
    const win = useWindowStore.getState().windows.find(w => w.id === 'win-2');
    expect(win?.bounds.x).toBeGreaterThan(0);
  });

  it('snapWindow full covers entire usable area', () => {
    useWindowStore.setState({
      windows: [{
        id: 'win-3', title: 'Test', bounds: { x: 100, y: 100, width: 400, height: 300 },
        z_order: 1, visibility: 'visible' as const, focused: true, content_type: 'panel', created_at: new Date().toISOString(),
      }],
    });

    useWindowStore.getState().snapWindow('win-3', 'full');
    const win = useWindowStore.getState().windows.find(w => w.id === 'win-3');
    expect(win?.bounds.x).toBe(0);
    expect(win?.bounds.width).toBe(window.innerWidth);
  });
});
