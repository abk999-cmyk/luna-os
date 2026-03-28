import { useState } from 'react';
import type { Workspace } from '../ipc/workspace';

interface Props {
  workspace: Workspace;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function WorkspaceCard({ workspace, isActive, onClick, onDelete }: Props) {
  const [showDelete, setShowDelete] = useState(false);

  const timeAgo = formatRelativeTime(workspace.updated_at);

  return (
    <div
      className={`workspace-card ${isActive ? 'workspace-card--active' : ''}`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDelete(true);
      }}
    >
      <div className="workspace-card__name">{workspace.name}</div>
      {workspace.goal && (
        <div className="workspace-card__goal">{workspace.goal}</div>
      )}
      <div className="workspace-card__meta">
        <span>{workspace.window_ids.length} window{workspace.window_ids.length !== 1 ? 's' : ''}</span>
        <span>{timeAgo}</span>
      </div>

      {showDelete && (
        <div style={{ marginTop: 8, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDelete(false); }}
            style={{
              padding: '2px 8px', fontSize: 11, border: '1px solid var(--border-subtle)',
              borderRadius: 4, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              padding: '2px 8px', fontSize: 11, border: 'none',
              borderRadius: 4, background: 'var(--color-error, #c44)', color: 'white', cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000; // timestamp may be in seconds
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
