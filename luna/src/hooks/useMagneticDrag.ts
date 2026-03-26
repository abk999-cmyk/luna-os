import { useCallback, useRef } from 'react';
import { useWindowStore } from '../stores/windowStore';

const SNAP_THRESHOLD = 25; // pixels

interface DragState {
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  windowId: string;
  groupDrag: boolean;
  groupOffsets: Map<string, { dx: number; dy: number }>;
}

interface SnapResult {
  x: number;
  y: number;
  snappedTo: string | null;
  snapEdge: 'left' | 'right' | 'top' | 'bottom' | null;
}

/** Compute snap position for a window relative to all other windows. */
function computeSnap(
  windowId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  allWindows: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }>,
  excludeIds: Set<string>,
): SnapResult {
  let bestDist = SNAP_THRESHOLD;
  let snapX = x;
  let snapY = y;
  let snappedTo: string | null = null;
  let snapEdge: SnapResult['snapEdge'] = null;

  const myRight = x + width;
  const myBottom = y + height;

  for (const other of allWindows) {
    if (other.id === windowId || excludeIds.has(other.id)) continue;

    const ob = other.bounds;
    const otherRight = ob.x + ob.width;
    const otherBottom = ob.y + ob.height;

    // Check vertical overlap (windows must be roughly aligned vertically to snap horizontally)
    const vertOverlap = myBottom > ob.y && y < otherBottom;
    // Check horizontal overlap
    const horizOverlap = myRight > ob.x && x < otherRight;

    if (vertOverlap) {
      // My right edge → other left edge
      const dist = Math.abs(myRight - ob.x);
      if (dist < bestDist) {
        bestDist = dist;
        snapX = ob.x - width;
        snapY = y;
        snappedTo = other.id;
        snapEdge = 'right';
      }

      // My left edge → other right edge
      const dist2 = Math.abs(x - otherRight);
      if (dist2 < bestDist) {
        bestDist = dist2;
        snapX = otherRight;
        snapY = y;
        snappedTo = other.id;
        snapEdge = 'left';
      }
    }

    if (horizOverlap) {
      // My bottom edge → other top edge
      const dist = Math.abs(myBottom - ob.y);
      if (dist < bestDist) {
        bestDist = dist;
        snapX = x;
        snapY = ob.y - height;
        snappedTo = other.id;
        snapEdge = 'bottom';
      }

      // My top edge → other bottom edge
      const dist2 = Math.abs(y - otherBottom);
      if (dist2 < bestDist) {
        bestDist = dist2;
        snapX = x;
        snapY = otherBottom;
        snappedTo = other.id;
        snapEdge = 'top';
      }
    }
  }

  return { x: snapX, y: snapY, snappedTo, snapEdge };
}

export function useMagneticDrag() {
  const dragState = useRef<DragState | null>(null);

  const startDrag = useCallback(
    (windowId: string, clientX: number, clientY: number, origX: number, origY: number) => {
      const store = useWindowStore.getState();
      const group = store.getWindowGroup(windowId);
      const isGroupDrag = group !== null;

      const groupOffsets = new Map<string, { dx: number; dy: number }>();
      if (isGroupDrag && group) {
        for (const memberId of group) {
          if (memberId === windowId) continue;
          const member = store.windows.find((w) => w.id === memberId);
          if (member) {
            groupOffsets.set(memberId, {
              dx: member.bounds.x - origX,
              dy: member.bounds.y - origY,
            });
          }
        }
      }

      dragState.current = {
        startX: clientX,
        startY: clientY,
        origX,
        origY,
        windowId,
        groupDrag: isGroupDrag,
        groupOffsets,
      };
    },
    [],
  );

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const ds = dragState.current;
    if (!ds) return;

    const store = useWindowStore.getState();
    const dx = clientX - ds.startX;
    const dy = clientY - ds.startY;
    let newX = Math.max(0, ds.origX + dx);
    let newY = Math.max(0, ds.origY + dy);

    const win = store.windows.find((w) => w.id === ds.windowId);
    if (!win) return;

    // Compute snap (exclude group members from snap targets)
    const excludeIds = new Set(ds.groupOffsets.keys());
    excludeIds.add(ds.windowId);

    const snap = computeSnap(
      ds.windowId,
      newX,
      newY,
      win.bounds.width,
      win.bounds.height,
      store.windows,
      excludeIds,
    );

    if (snap.snappedTo) {
      newX = snap.x;
      newY = snap.y;

      // Create group if snapped and not already grouped
      const currentGroup = store.getWindowGroup(ds.windowId);
      if (!currentGroup?.has(snap.snappedTo)) {
        store.joinWindows(ds.windowId, snap.snappedTo);
      }
    } else {
      // Not snapped — detach from group if previously grouped
      const currentGroup = store.getWindowGroup(ds.windowId);
      if (currentGroup && currentGroup.size > 1) {
        store.detachWindow(ds.windowId);
      }
    }

    // Update main window position
    store.updateWindowPosition(ds.windowId, newX, newY);

    // Move group members
    if (ds.groupDrag) {
      for (const [memberId, offset] of ds.groupOffsets) {
        store.updateWindowPosition(memberId, newX + offset.dx, newY + offset.dy);
      }
    }
  }, []);

  const endDrag = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    const store = useWindowStore.getState();
    const win = store.windows.find((w) => w.id === ds.windowId);
    if (win) {
      store.syncWindowPosition(ds.windowId, win.bounds.x, win.bounds.y);
    }

    // Sync group members too
    if (ds.groupDrag) {
      for (const memberId of ds.groupOffsets.keys()) {
        const member = store.windows.find((w) => w.id === memberId);
        if (member) {
          store.syncWindowPosition(memberId, member.bounds.x, member.bounds.y);
        }
      }
    }

    dragState.current = null;
  }, []);

  const isDragging = useCallback(() => dragState.current !== null, []);

  return { startDrag, moveDrag, endDrag, isDragging };
}
