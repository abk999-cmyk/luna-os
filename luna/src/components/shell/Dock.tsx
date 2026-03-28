import { useState, useCallback, useMemo } from 'react';
import { useWindowStore } from '../../stores/windowStore';
import { useActivityStore } from '../../stores/activityStore';
import { TextInputBar } from '../TextInputBar';

interface DockApp {
  id: string;
  label: string;
  contentType: string;
  icon: React.ReactNode;
}

// Essential apps shown in dock
const DOCK_APPS: DockApp[] = [
  { id: 'notes', label: 'Notes', contentType: 'notes', icon: <NotesIcon /> },
  { id: 'file_manager', label: 'Files', contentType: 'file_manager', icon: <FilesIcon /> },
  { id: 'terminal', label: 'Terminal', contentType: 'terminal', icon: <TerminalIcon /> },
  { id: 'browser', label: 'Browser', contentType: 'browser', icon: <BrowserIcon /> },
  { id: 'canvas', label: 'Canvas', contentType: 'canvas', icon: <CanvasIcon /> },
];

// All apps available in launcher
const ALL_APPS: DockApp[] = [
  ...DOCK_APPS,
  { id: 'calculator', label: 'Calculator', contentType: 'calculator', icon: <CalculatorIcon /> },
  { id: 'kanban', label: 'Kanban', contentType: 'kanban', icon: <KanbanIcon /> },
  { id: 'calendar', label: 'Calendar', contentType: 'calendar', icon: <CalendarIcon /> },
  { id: 'email', label: 'Email', contentType: 'email', icon: <EmailIcon /> },
  { id: 'spreadsheet', label: 'Spreadsheet', contentType: 'spreadsheet', icon: <SpreadsheetIcon /> },
  { id: 'slides', label: 'Slides', contentType: 'slides', icon: <SlidesIcon /> },
];

export function Dock() {
  const windows = useWindowStore((s) => s.windows);
  const addWindow = useWindowStore((s) => s.addWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const [bouncingId, setBouncingId] = useState<string | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const events = useActivityStore((s) => s.events);
  const activeWindowIds = useMemo(() => {
    const now = Date.now();
    const threshold = 3000;
    const active = new Set<string>();
    for (const e of events) {
      if (e.windowId && now - e.timestamp < threshold && e.status !== 'failed') {
        active.add(e.windowId);
      }
    }
    return active;
  }, [events]);

  const minimizedWindows = windows.filter((w) => w.visibility === 'minimized');

  // Get unique running app types (for "honest dock" — only show what's running)
  const runningAppTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: DockApp[] = [];
    for (const win of windows) {
      if (win.visibility !== 'hidden' && win.content_type && !seen.has(win.content_type)) {
        seen.add(win.content_type);
        const app = DOCK_APPS.find((a) => a.contentType === win.content_type);
        if (app) result.push(app);
      }
    }
    return result;
  }, [windows]);

  // Check if agent is working on an app type
  const agentWorkingTypes = useMemo(() => {
    const types = new Set<string>();
    for (const win of windows) {
      if (win.content_type && activeWindowIds.has(win.id)) {
        types.add(win.content_type);
      }
    }
    return types;
  }, [windows, activeWindowIds]);

  const handleAppClick = useCallback(async (app: DockApp) => {
    const existing = windows.find((w) => w.content_type === app.contentType && w.visibility === 'visible');
    if (existing) {
      await focusWindow(existing.id);
      return;
    }
    const minimized = windows.find((w) => w.content_type === app.contentType && w.visibility === 'minimized');
    if (minimized) {
      await restoreWindow(minimized.id);
      await focusWindow(minimized.id);
      return;
    }
    setBouncingId(app.id);
    setTimeout(() => setBouncingId(null), 400);
    await addWindow(app.label, app.contentType);
    setLauncherOpen(false);
  }, [windows, addWindow, focusWindow, restoreWindow]);

  const handleMinimizedClick = useCallback(async (windowId: string) => {
    await restoreWindow(windowId);
    await focusWindow(windowId);
  }, [restoreWindow, focusWindow]);

  return (
    <>
      <div className="dock">
        {/* Running apps only */}
        <div className="dock__section">
          {runningAppTypes.map((app) => (
            <button
              key={app.id}
              className={`dock__item dock__item--active ${bouncingId === app.id ? 'animate-dock-bounce' : ''} ${agentWorkingTypes.has(app.contentType) ? 'dock__item--agent-working' : ''}`}
              onClick={() => handleAppClick(app)}
              title={app.label}
            >
              {app.icon}
              <div className="dock__indicator" />
              <span className="dock__tooltip">{app.label}</span>
            </button>
          ))}

          {/* Launcher "+" button */}
          <button
            className={`dock__item dock__launcher-btn ${launcherOpen ? 'dock__item--active' : ''}`}
            onClick={() => setLauncherOpen(!launcherOpen)}
            title="Open app"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="dock__tooltip">Open app</span>
          </button>
        </div>

        {/* Minimized windows */}
        {minimizedWindows.length > 0 && (
          <>
            <div className="dock__separator" />
            <div className="dock__section">
              {minimizedWindows.map((w) => (
                <button
                  key={w.id}
                  className="dock__item"
                  onClick={() => handleMinimizedClick(w.id)}
                  title={w.title}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span className="dock__tooltip">{w.title}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="dock__separator" />

        {/* Text input */}
        <div className="dock__input-wrapper">
          <TextInputBar />
        </div>
      </div>

      {/* App launcher overlay */}
      {launcherOpen && (
        <div className="dock-launcher" onClick={() => setLauncherOpen(false)}>
          <div className="dock-launcher__panel" onClick={(e) => e.stopPropagation()}>
            <div className="dock-launcher__title">Apps</div>
            <div className="dock-launcher__grid">
              {ALL_APPS.map((app) => (
                <button
                  key={app.id}
                  className="dock-launcher__app"
                  onClick={() => handleAppClick(app)}
                >
                  {app.icon}
                  <span>{app.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// === Inline SVG Icons ===

function NotesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
      <line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" />
      <line x1="16" y1="14" x2="16" y2="14.01" />
      <line x1="8" y1="18" x2="8" y2="18.01" />
      <line x1="12" y1="18" x2="16" y2="18" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="12" rx="1" />
      <rect x="17" y="3" width="5" height="15" rx="1" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function SpreadsheetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function SlidesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 8l5 3-5 3V8z" />
    </svg>
  );
}

function BrowserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}
