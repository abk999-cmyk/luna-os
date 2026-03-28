import { useCallback, useState, useEffect } from 'react';
import { useShellStore } from '../stores/shellStore';
import { ChatPanel } from './ChatPanel';
import { UndoTimeline } from './trust/UndoTimeline';
import { useActivityStore } from '../stores/activityStore';
import { searchSemanticMemory } from '../ipc/memory';

type SidebarTab = 'chat' | 'activity' | 'memory';

const TABS: { id: SidebarTab; label: string; icon: string }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  },
  {
    id: 'activity',
    label: 'Timeline',
    icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
];

export function Sidebar() {
  const sidebarTab = useShellStore((s) => s.sidebarTab) as SidebarTab;
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
          {sidebarTab === 'activity' && (
            <div className="sidebar__timeline">
              <UndoTimeline open onClose={() => setSidebarTab('chat')} embedded />
            </div>
          )}
          {sidebarTab === 'memory' && <MemoryPanel />}
        </div>
      )}
    </div>
  );
}

/** Memory Panel — shows stored semantic memories from the activity feed + backend */
function MemoryPanel() {
  const events = useActivityStore((s) => s.events);
  const [memories, setMemories] = useState<{ key: string; value: string; timestamp?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTag, setSearchTag] = useState('');

  // Extract memory events from activity store
  const memoryEvents = events.filter((e) => e.type === 'memory');

  // Load memories from backend
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchSemanticMemory(searchTag || '*')
      .then((results) => {
        if (cancelled) return;
        setMemories(
          results.map((r: any) => ({
            key: r.key || r.Key || '',
            value: r.value || r.Value || '',
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [searchTag, memoryEvents.length]); // Re-fetch when memory events change

  return (
    <div className="memory-panel">
      <div className="memory-panel__header">
        <input
          className="memory-panel__search"
          type="text"
          placeholder="Search memories..."
          value={searchTag}
          onChange={(e) => setSearchTag(e.target.value)}
        />
      </div>

      <div className="memory-panel__list">
        {loading && (
          <div className="memory-panel__empty">Loading memories...</div>
        )}

        {!loading && memories.length === 0 && memoryEvents.length === 0 && (
          <div className="memory-panel__empty">
            No memories stored yet. Luna will remember things as you work together.
          </div>
        )}

        {/* Stored memories from backend */}
        {memories.map((mem, i) => (
          <div key={`stored-${i}`} className="memory-card">
            <div className="memory-card__key">{mem.key}</div>
            <div className="memory-card__value">{mem.value}</div>
          </div>
        ))}

        {/* Recent memory activity */}
        {memoryEvents.length > 0 && (
          <>
            <div className="memory-panel__section-label">Recent Activity</div>
            {memoryEvents.slice(-20).reverse().map((event) => (
              <div key={event.id} className="memory-card memory-card--activity">
                <div className="memory-card__key">{event.description}</div>
                <div className="memory-card__time">
                  {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
