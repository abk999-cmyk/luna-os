import { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useShellStore } from '../../stores/shellStore';
import { useAgentStore } from '../../stores/agentStore';
import { PermissionModeSwitcher } from '../trust/PermissionModeSwitcher';

export function TopBar() {
  const [time, setTime] = useState(formatTime());
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setWorkspaceBrowserOpen = useShellStore((s) => s.setWorkspaceBrowserOpen);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);
  const agentStatus = useAgentStore((s) => s.status);
  const settingsOpen = useShellStore((s) => s.settingsOpen);
  const toggleSettings = useShellStore((s) => s.toggleSettings);
  const closeSettings = useShellStore((s) => s.closeSettings);

  const [wifiOpen, setWifiOpen] = useState(false);
  const [btOpen, setBtOpen] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="topbar__left">
          {/* Sidebar toggle */}
          <button
            className="topbar__btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <button
            className="topbar__workspace-name"
            onClick={() => setWorkspaceBrowserOpen(true)}
            title="Open workspace browser"
          >
            {activeWorkspace?.name || 'No Workspace'}
          </button>

          {/* Agent status indicator */}
          {agentStatus === 'streaming' && (
            <span className="topbar__agent-status topbar__agent-status--working">
              <span className="topbar__agent-dot" />
              Luna is working
            </span>
          )}
        </div>

        <div className="topbar__center">
          <span>{time}</span>
        </div>

        <div className="topbar__right">
          {/* WiFi icon */}
          <button
            className="topbar__btn"
            onClick={() => { setWifiOpen((v) => !v); setBtOpen(false); }}
            title="WiFi"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </button>

          {/* Bluetooth icon */}
          <button
            className="topbar__btn"
            onClick={() => { setBtOpen((v) => !v); setWifiOpen(false); }}
            title="Bluetooth"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
            </svg>
          </button>

          {/* Settings gear */}
          <button
            className="topbar__btn"
            onClick={toggleSettings}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* WiFi popover */}
      {wifiOpen && (
        <SystemTrayPopover onClose={() => setWifiOpen(false)} style={{ right: 60 }}>
          <strong>WiFi</strong>
          <span>Connected via host system</span>
        </SystemTrayPopover>
      )}

      {/* Bluetooth popover */}
      {btOpen && (
        <SystemTrayPopover onClose={() => setBtOpen(false)} style={{ right: 36 }}>
          <strong>Bluetooth</strong>
          <span>Bluetooth available (simulated)</span>
        </SystemTrayPopover>
      )}

      {/* Settings popover */}
      {settingsOpen && <SettingsPopover onClose={closeSettings} />}
    </>
  );
}

/* ---------- Settings Popover ---------- */

function SettingsPopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="settings-popover glass-intense">
      <div className="settings-popover__section">
        <div className="settings-popover__label">Trust Level</div>
        <PermissionModeSwitcher />
      </div>
      <div className="settings-popover__divider" />
      <div className="settings-popover__section">
        <div className="settings-popover__label">Appearance</div>
        <ThemeSelector />
      </div>
      <div className="settings-popover__divider" />
      <div className="settings-popover__section">
        <div className="settings-popover__label">About</div>
        <div className="settings-popover__about">
          <span>Luna OS v0.1</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>AI-native desktop environment</span>
        </div>
      </div>
      <div className="settings-popover__divider" />
      <div className="settings-popover__section">
        <div className="settings-popover__label">Shortcuts</div>
        <div className="settings-popover__shortcuts">
          <div className="settings-popover__shortcut"><kbd>&#8984;</kbd><kbd>K</kbd> <span>Command palette</span></div>
          <div className="settings-popover__shortcut"><kbd>&#8984;</kbd><kbd>B</kbd> <span>Toggle sidebar</span></div>
          <div className="settings-popover__shortcut"><kbd>&#8984;</kbd><kbd>N</kbd> <span>New window</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Theme Selector ---------- */

function ThemeSelector() {
  const theme = useShellStore((s) => s.theme);
  const setTheme = useShellStore((s) => s.setTheme);
  return (
    <div className="theme-selector">
      {(['light', 'dark', 'system'] as const).map((t) => (
        <button
          key={t}
          className={`theme-selector__btn ${theme === t ? 'theme-selector__btn--active' : ''}`}
          onClick={() => setTheme(t)}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

/* ---------- System Tray Popover (WiFi / Bluetooth) ---------- */

function SystemTrayPopover({
  onClose,
  style,
  children,
}: {
  onClose: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="system-tray-popover glass-intense" style={style}>
      {children}
    </div>
  );
}

/* ---------- Helpers ---------- */

function formatTime(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date}  ${time}`;
}
