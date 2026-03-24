import { useWindowStore } from '../stores/windowStore';

/** SVG overlay that draws visual connector lines between grouped windows. */
export function WindowConnector() {
  const windows = useWindowStore((s) => s.windows);
  const windowGroups = useWindowStore((s) => s.windowGroups);

  const lines: Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];

  // For each group, draw lines between adjacent members
  for (const [groupId, memberIds] of windowGroups) {
    const members = Array.from(memberIds)
      .map((id) => windows.find((w) => w.id === id))
      .filter(Boolean) as typeof windows;

    // Connect each pair that shares an edge
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];

        // Centers
        const ax = a.bounds.x + a.bounds.width / 2;
        const ay = a.bounds.y + a.bounds.height / 2;
        const bx = b.bounds.x + b.bounds.width / 2;
        const by = b.bounds.y + b.bounds.height / 2;

        // Only draw if windows are close enough (adjacent)
        const dist = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
        const maxDist = (a.bounds.width + b.bounds.width + a.bounds.height + b.bounds.height) / 2;
        if (dist < maxDist) {
          lines.push({
            key: `${groupId}-${a.id}-${b.id}`,
            x1: ax,
            y1: ay,
            x2: bx,
            y2: by,
          });
        }
      }
    }
  }

  if (lines.length === 0) return null;

  return (
    <svg
      className="window-connectors"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {lines.map((line) => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="var(--accent-warm)"
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.4}
        />
      ))}
    </svg>
  );
}
