import { useCallback, useState } from 'react';
import type { ActivityEvent } from '../stores/activityStore';
import { useWindowStore } from '../stores/windowStore';

const TYPE_ICONS: Record<string, { svg: string; color: string }> = {
  file: {
    svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    color: 'var(--color-amber-500, #d4a574)',
  },
  shell: {
    svg: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    color: 'var(--color-teal-500, #3da89f)',
  },
  window: {
    svg: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    color: 'var(--color-info, #5d8ba8)',
  },
  memory: {
    svg: '<path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z"/><path d="M16 14H8a4 4 0 00-4 4v2h16v-2a4 4 0 00-4-4z"/>',
    color: 'var(--color-amber-300, #ffd97d)',
  },
  agent: {
    svg: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    color: 'var(--color-amber-500, #d4a574)',
  },
  plan: {
    svg: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
    color: 'var(--color-success, #4fad6f)',
  },
  system: {
    svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    color: 'var(--text-tertiary)',
  },
};

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatCompactTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface ActionCardProps {
  event: ActivityEvent;
  compact?: boolean;
}

export function ActionCard({ event, compact }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const focusWindow = useWindowStore((s) => s.focusWindow);

  const typeInfo = TYPE_ICONS[event.type] || TYPE_ICONS.system;

  const handleClick = useCallback(() => {
    if (event.windowId) {
      focusWindow(event.windowId);
    } else if (event.payload && (event.type === 'shell' || event.type === 'file')) {
      setExpanded((prev) => !prev);
    }
  }, [event, focusWindow]);

  const shellOutput = event.type === 'shell' ? String(event.payload?.output || '') : '';
  const hasDetails = shellOutput.length > 0;
  const isClickable = !!event.windowId || hasDetails;

  return (
    <div
      className={`action-card ${compact ? 'action-card--compact' : ''} ${isClickable ? 'action-card--clickable' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className="action-card__icon" style={{ color: typeInfo.color }}>
        <svg
          width={compact ? 12 : 14}
          height={compact ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: typeInfo.svg }}
        />
      </div>
      <div className="action-card__content">
        <span className="action-card__description">{event.description}</span>
        <span className="action-card__meta">
          {event.agentId && <span className="action-card__agent">{event.agentId}</span>}
          <span>{compact ? formatCompactTime(event.timestamp) : formatRelativeTime(event.timestamp)}</span>
          {event.status === 'failed' && <span className="action-card__status action-card__status--failed">failed</span>}
          {!compact && event.windowId && <span className="action-card__status action-card__status--link">click to focus</span>}
        </span>
      </div>
      {event.status === 'pending' && (
        <div className="action-card__spinner" />
      )}
      {expanded && hasDetails && (
        <pre className="action-card__details">
          {shellOutput.slice(0, 500)}
        </pre>
      )}
    </div>
  );
}
