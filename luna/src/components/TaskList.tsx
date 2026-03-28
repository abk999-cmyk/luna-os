import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/taskStore';
import type { TaskNode } from '../ipc/tasks';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '◎',
  completed: '✓',
  failed: '✗',
  dispatched: '◉',
};

export function TaskList({ open, onClose }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) loadTasks();
  }, [open, loadTasks]);

  // Auto-scroll to bottom when new tasks appear
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [tasks.length]);

  if (!open) return null;

  const running = tasks.filter((t) => t.status === 'running');
  const completed = tasks.filter((t) => t.status === 'completed');
  const failed = tasks.filter((t) => t.status === 'failed');

  return (
    <div className="task-list">
      <div className="task-list__header">
        <span className="task-list__title">Tasks</span>
        <button className="topbar__btn" onClick={onClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="task-list__body" ref={bodyRef}>
        {tasks.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            No tasks yet. Send a message to start.
          </div>
        )}
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>

      <div className="task-list__footer">
        <span>{completed.length}/{tasks.length} done</span>
        {running.length > 0 && <span>{running.length} running</span>}
        {failed.length > 0 && <span style={{ color: 'var(--color-error, #c44)' }}>{failed.length} failed</span>}
      </div>
    </div>
  );
}

function TaskItem({ task }: { task: TaskNode }) {
  const [expanded, setExpanded] = useState(false);
  const statusClass = `task-item__status--${task.status}`;

  return (
    <div className="task-item" onClick={() => setExpanded(!expanded)}>
      <div className={`task-item__status ${statusClass}`}>
        {STATUS_ICONS[task.status] || '○'}
      </div>
      <div className="task-item__content">
        <div className="task-item__label">{task.label || task.id}</div>
        <div className="task-item__meta">
          {task.agent_id && <span>{task.agent_id}</span>}
          {task.status === 'running' && <TaskTimer startTime={task.created_at} />}
        </div>
        {expanded && task.result != null && (
          <div style={{
            marginTop: 6,
            padding: '6px 8px',
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}>
            {typeof task.result === 'string' ? task.result : JSON.stringify(task.result as object, null, 2)}
          </div>
        )}
      </div>
      {task.status === 'running' && (
        <TaskTimer startTime={task.created_at} />
      )}
    </div>
  );
}

function TaskTimer({ startTime }: { startTime?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const start = typeof startTime === 'number' ? startTime * 1000 : Date.now();
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const str = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;

  return <span className="task-item__timer">{str}</span>;
}
