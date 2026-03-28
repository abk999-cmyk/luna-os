import { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useShellStore } from '../../stores/shellStore';
import { useWindowStore } from '../../stores/windowStore';
import { useAgentStore } from '../../stores/agentStore';
import { PermissionModeSwitcher } from '../trust/PermissionModeSwitcher';

export function TopBar() {
  const [time, setTime] = useState(formatTime());
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setWorkspaceBrowserOpen = useShellStore((s) => s.setWorkspaceBrowserOpen);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);
  const addWindow = useWindowStore((s) => s.addWindow);
  const agentStatus = useAgentStore((s) => s.status);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const openSettings = useCallback(() => {
    addWindow('Settings', 'settings', undefined, undefined, undefined, 500, 450);
  }, [addWindow]);

  return (
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
        <PermissionModeSwitcher />

        {/* Settings / Profile */}
        <button
          className="topbar__btn"
          onClick={openSettings}
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatTime(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date}  ${time}`;
}
