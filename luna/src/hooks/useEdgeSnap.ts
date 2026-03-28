import { useState, useCallback } from 'react';

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'maximize' | null;

const EDGE_THRESHOLD = 20;
const CORNER_THRESHOLD = 40;

interface DesktopBounds {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface SnapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useEdgeSnap() {
  const [activeZone, setActiveZone] = useState<SnapZone>(null);

  const computeZone = useCallback((clientX: number, clientY: number, bounds: DesktopBounds): SnapZone => {
    const nearLeft = clientX - bounds.left < EDGE_THRESHOLD;
    const nearRight = bounds.right - clientX < EDGE_THRESHOLD;
    const nearTop = clientY - bounds.top < EDGE_THRESHOLD;
    const cornerLeft = clientX - bounds.left < CORNER_THRESHOLD;
    const cornerRight = bounds.right - clientX < CORNER_THRESHOLD;
    const cornerTop = clientY - bounds.top < CORNER_THRESHOLD;
    const cornerBottom = bounds.bottom - clientY < CORNER_THRESHOLD;

    // Corners first
    if (cornerTop && cornerLeft) return 'top-left';
    if (cornerTop && cornerRight) return 'top-right';
    if (cornerBottom && cornerLeft) return 'bottom-left';
    if (cornerBottom && cornerRight) return 'bottom-right';

    // Edges
    if (nearTop) return 'maximize';
    if (nearLeft) return 'left';
    if (nearRight) return 'right';

    return null;
  }, []);

  const updateZone = useCallback((clientX: number, clientY: number, bounds: DesktopBounds) => {
    const zone = computeZone(clientX, clientY, bounds);
    setActiveZone(zone);
    return zone;
  }, [computeZone]);

  const clearZone = useCallback(() => {
    setActiveZone(null);
  }, []);

  const getTargetBounds = useCallback((zone: SnapZone, bounds: DesktopBounds): SnapBounds | null => {
    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    switch (zone) {
      case 'left':
        return { x: bounds.left, y: bounds.top, width: halfW, height: h };
      case 'right':
        return { x: bounds.left + halfW, y: bounds.top, width: w - halfW, height: h };
      case 'maximize':
        return { x: bounds.left, y: bounds.top, width: w, height: h };
      case 'top-left':
        return { x: bounds.left, y: bounds.top, width: halfW, height: halfH };
      case 'top-right':
        return { x: bounds.left + halfW, y: bounds.top, width: w - halfW, height: halfH };
      case 'bottom-left':
        return { x: bounds.left, y: bounds.top + halfH, width: halfW, height: h - halfH };
      case 'bottom-right':
        return { x: bounds.left + halfW, y: bounds.top + halfH, width: w - halfW, height: h - halfH };
      default:
        return null;
    }
  }, []);

  return { activeZone, updateZone, clearZone, getTargetBounds };
}
