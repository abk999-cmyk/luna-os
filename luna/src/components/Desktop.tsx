import { useWindowStore } from '../stores/windowStore';
import { Window } from './Window';
import { TextInputBar } from './TextInputBar';

export function Desktop() {
  const windows = useWindowStore((s) => s.windows);
  const unfocusAll = useWindowStore((s) => s.unfocusAll);

  const handleDesktopClick = (e: React.MouseEvent) => {
    // Only unfocus if clicking directly on desktop (not on a window)
    if (e.target === e.currentTarget) {
      unfocusAll();
    }
  };

  // Sort windows by z_order for rendering (lower z_order renders first / behind)
  const sortedWindows = [...windows]
    .filter((w) => w.visibility !== 'hidden')
    .sort((a, b) => a.z_order - b.z_order);

  return (
    <div
      className="desktop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--canvas-bg)',
        overflow: 'hidden',
        paddingBottom: 56, // space for input bar
      }}
      onClick={handleDesktopClick}
    >
      {sortedWindows.map((win) => (
        <Window key={win.id} window={win} />
      ))}

      {/* Minimized windows bar */}
      {windows.some((w) => w.visibility === 'minimized') && (
        <MinimizedBar />
      )}

      <TextInputBar />
    </div>
  );
}

function MinimizedBar() {
  const windows = useWindowStore((s) => s.windows);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);

  const minimized = windows.filter((w) => w.visibility === 'minimized');

  if (minimized.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 64,
        left: 16,
        display: 'flex',
        gap: 8,
        zIndex: 800,
      }}
    >
      {minimized.map((w) => (
        <button
          key={w.id}
          onClick={async () => {
            await restoreWindow(w.id);
            await focusWindow(w.id);
          }}
          style={{
            padding: '4px 12px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-system)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {w.title}
        </button>
      ))}
    </div>
  );
}
