import { useState, useEffect, useCallback } from 'react';
import { getUndoHistory, undoLastAction, type UndoEntry } from '../../ipc/undo';
import { addToast } from '../primitives/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export function UndoTimeline({ open, onClose, embedded }: Props) {
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUndoHistory(30).then((data) => {
      setEntries(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open]);

  const handleUndo = useCallback(async () => {
    try {
      const result = await undoLastAction();
      if (result.undone) {
        addToast('Action undone', 'success');
        // Reload history
        const data = await getUndoHistory(30);
        setEntries(data);
      } else {
        addToast(result.reason || 'Nothing to undo', 'info');
      }
    } catch {
      addToast('Undo failed', 'error');
    }
  }, []);

  if (!open) return null;

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  return (
    <div className={`undo-timeline ${embedded ? 'undo-timeline--embedded' : ''}`}>
      {!embedded && (
        <div className="undo-timeline__header">
          <span className="undo-timeline__title">Undo History</span>
          <button className="topbar__btn" onClick={onClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="undo-timeline__body">
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            No undoable actions in history.
          </div>
        )}

        {entries.map((entry, idx) => {
          const isExecuted = entry.executed;
          const createdMs = entry.created_at * 1000;
          const isExpired = (now - createdMs) > DAY_MS;
          const timeStr = formatTimestamp(createdMs);

          return (
            <div
              key={entry.id}
              className={`undo-entry ${isExecuted ? 'undo-entry--executed' : ''} ${isExpired ? 'undo-entry--expired' : ''}`}
            >
              <div className="undo-entry__info">
                <div className="undo-entry__action">{entry.action_type}</div>
                <div className="undo-entry__meta">
                  {entry.agent_id} · {timeStr}
                </div>
              </div>
              {!isExecuted && !isExpired && idx === 0 && (
                <button className="undo-entry__btn" onClick={handleUndo}>
                  Undo
                </button>
              )}
              {isExecuted && (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Undone</span>
              )}
              {isExpired && !isExecuted && (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Expired</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
