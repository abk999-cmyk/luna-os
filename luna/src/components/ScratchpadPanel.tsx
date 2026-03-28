import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface ScratchpadEntry {
  task_id: string;
  agent_id: string;
  step: number;
  content: string;
  timestamp: number;
}

interface ScratchpadPanelProps {
  workspaceId?: string;
  onClose?: () => void;
}

export function ScratchpadPanel({ workspaceId = 'workspace_default', onClose }: ScratchpadPanelProps) {
  const [entries, setEntries] = useState<ScratchpadEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Load initial scratchpad state
    invoke<ScratchpadEntry[]>('get_scratchpad', { workspaceId })
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch(() => {});

    // Listen for live updates
    const unlisten = listen<{ workspace_id: string; entry: ScratchpadEntry }>(
      'scratchpad-update',
      (event) => {
        if (event.payload.workspace_id === workspaceId) {
          setEntries((prev) => [...prev, event.payload.entry]);
        }
      }
    );

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [workspaceId]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="scratchpad-panel">
      <div className="scratchpad-header">
        <span className="scratchpad-title">Agent Scratchpad</span>
        <span className="scratchpad-workspace">{workspaceId}</span>
        {onClose && (
          <button className="scratchpad-close" onClick={onClose} aria-label="Close">×</button>
        )}
      </div>
      <div className="scratchpad-entries">
        {entries.length === 0 ? (
          <div className="scratchpad-empty">No agent activity yet</div>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="scratchpad-entry">
              <div className="scratchpad-entry-meta">
                <span className="scratchpad-agent">{entry.agent_id}</span>
                <span className="scratchpad-step">step {entry.step}</span>
                <span className="scratchpad-time">{formatTime(entry.timestamp)}</span>
              </div>
              <div className="scratchpad-entry-content">{entry.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
