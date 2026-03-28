import { useCallback } from 'react';
import { useShellStore } from '../stores/shellStore';
import { ChatPanel } from './ChatPanel';
import { ActivityFeed } from './ActivityFeed';
import { UndoTimeline } from './trust/UndoTimeline';

type SidebarTab = 'chat' | 'activity' | 'history';

const TABS: { id: SidebarTab; label: string; icon: string }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  },
  {
    id: 'history',
    label: 'History',
    icon: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/>',
  },
];

export function Sidebar() {
  const sidebarTab = useShellStore((s) => s.sidebarTab);
  const setSidebarTab = useShellStore((s) => s.setSidebarTab);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);

  const handleTabClick = useCallback(
    (tab: SidebarTab) => {
      if (sidebarCollapsed) {
        toggleSidebar();
      }
      setSidebarTab(tab);
    },
    [sidebarCollapsed, toggleSidebar, setSidebarTab]
  );

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Tab bar */}
      <div className="sidebar__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sidebar__tab ${sidebarTab === tab.id && !sidebarCollapsed ? 'sidebar__tab--active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            title={tab.label}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: tab.icon }}
            />
            {!sidebarCollapsed && <span>{tab.label}</span>}
          </button>
        ))}

        <button
          className="sidebar__collapse-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {sidebarCollapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      {/* Tab content */}
      {!sidebarCollapsed && (
        <div className="sidebar__content">
          {sidebarTab === 'chat' && <ChatPanel />}
          {sidebarTab === 'activity' && <ActivityFeed />}
          {sidebarTab === 'history' && <UndoTimeline open onClose={() => setSidebarTab('chat')} embedded />}
        </div>
      )}
    </div>
  );
}
