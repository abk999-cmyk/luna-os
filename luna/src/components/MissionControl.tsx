import { useEffect, useCallback } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { useShellStore } from '../stores/shellStore';

export function MissionControl() {
  const windows = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const setMissionControlOpen = useShellStore((s) => s.setMissionControlOpen);

  const visibleWindows = windows.filter((w) => w.visibility !== 'hidden');

  const handleSelect = useCallback(async (windowId: string) => {
    await focusWindow(windowId);
    setMissionControlOpen(false);
  }, [focusWindow, setMissionControlOpen]);

  const handleClose = useCallback(() => {
    setMissionControlOpen(false);
  }, [setMissionControlOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <div className="mission-control" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="mission-control__title">
        All Windows
      </div>

      {visibleWindows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, marginTop: 40 }}>
          No windows open. Press Escape to close.
        </div>
      )}

      <div className="mission-control__grid">
        {visibleWindows.map((win) => {
          const isFocused = win.focused;
          return (
            <div
              key={win.id}
              className={`mission-control__card ${isFocused ? 'mission-control__card--focused' : ''}`}
              onClick={() => handleSelect(win.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ContentTypeIcon contentType={win.content_type} />
                <div className="mission-control__card-title">{win.title}</div>
              </div>
              <div className="mission-control__card-meta">
                {win.content_type} · {win.bounds.width}×{win.bounds.height}
              </div>
              {win.visibility === 'minimized' && (
                <div style={{ fontSize: 10, color: 'var(--color-amber-500, #d4a574)', marginTop: 4 }}>
                  Minimized
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContentTypeIcon({ contentType }: { contentType: string }) {
  const iconMap: Record<string, string> = {
    notes: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    calculator: 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
    file_manager: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    terminal: 'M4 17l6-6-6-6',
    browser: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    panel: 'M3 3h18v18H3z',
  };

  const path = iconMap[contentType] || iconMap.panel;

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
      <path d={path} />
    </svg>
  );
}
