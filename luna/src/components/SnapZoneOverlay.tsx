import type { SnapZone } from '../hooks/useEdgeSnap';

interface Props {
  activeZone: SnapZone;
  desktopBounds: { top: number; left: number; right: number; bottom: number };
}

export function SnapZoneOverlay({ activeZone, desktopBounds }: Props) {
  if (!activeZone) return null;

  const w = desktopBounds.right - desktopBounds.left;
  const h = desktopBounds.bottom - desktopBounds.top;
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);

  const zones: Record<string, { left: number; top: number; width: number; height: number }> = {
    left: { left: 0, top: 0, width: halfW, height: h },
    right: { left: halfW, top: 0, width: w - halfW, height: h },
    maximize: { left: 0, top: 0, width: w, height: h },
    'top-left': { left: 0, top: 0, width: halfW, height: halfH },
    'top-right': { left: halfW, top: 0, width: w - halfW, height: halfH },
    'bottom-left': { left: 0, top: halfH, width: halfW, height: h - halfH },
    'bottom-right': { left: halfW, top: halfH, width: w - halfW, height: h - halfH },
  };

  const zone = zones[activeZone];
  if (!zone) return null;

  return (
    <div
      className="snap-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
      }}
    >
      <div
        className="snap-zone"
        style={{
          left: zone.left + 4,
          top: zone.top + 4,
          width: zone.width - 8,
          height: zone.height - 8,
        }}
      />
    </div>
  );
}
