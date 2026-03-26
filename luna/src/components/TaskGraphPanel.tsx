import { useEffect, useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useSubscription } from '../sync/useSubscription';
import type { TaskNode } from '../ipc/tasks';

interface TaskGraphPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '\u25CB',   // ○
  running: '\u25D4',   // ◔
  completed: '\u2713', // ✓
  failed: '\u2717',    // ✗
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--color-gray-400, #999)',
  running: 'var(--color-info, #5b9fd4)',
  completed: 'var(--color-success, #6a9)',
  failed: 'var(--color-error, #c44)',
};

export function TaskGraphPanel({ open, onClose }: TaskGraphPanelProps) {
  const { tasks, loadTasks } = useTaskStore();
  const updateTask = useTaskStore((s) => s.updateTask);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) loadTasks();
  }, [open, loadTasks]);

  // Real-time task updates
  useSubscription('task.*', (payload: TaskNode) => {
    updateTask(payload);
  });

  if (!open) return null;

  // Build tree structure
  const rootTasks = tasks.filter((t) => !t.parent_id);
  const childMap = new Map<string, TaskNode[]>();
  for (const t of tasks) {
    if (t.parent_id) {
      const children = childMap.get(t.parent_id) || [];
      children.push(t);
      childMap.set(t.parent_id, children);
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TaskNode, depth: number) => {
    const children = childMap.get(node.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            paddingLeft: 8 + depth * 16,
            cursor: hasChildren ? 'pointer' : 'default',
            borderRadius: 4,
            fontSize: '0.82rem',
            fontFamily: 'var(--font-system)',
            color: 'var(--color-text, #e0dcd8)',
          }}
          onClick={() => hasChildren && toggleExpand(node.id)}
        >
          {hasChildren && (
            <span style={{ fontSize: '0.7rem', width: 12, textAlign: 'center', flexShrink: 0 }}>
              {isExpanded ? '\u25BC' : '\u25B6'}
            </span>
          )}
          {!hasChildren && <span style={{ width: 12, flexShrink: 0 }} />}
          <span
            style={{
              color: STATUS_COLORS[node.status],
              fontWeight: 600,
              fontSize: '0.85rem',
              flexShrink: 0,
            }}
          >
            {STATUS_ICONS[node.status]}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #8a8580)', flexShrink: 0 }}>
            {node.agent_id}
          </span>
        </div>
        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 340,
        height: '100vh',
        background: 'var(--surface-elevated, #2a2725)',
        borderLeft: '1px solid var(--border-subtle, #3a3633)',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.3)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slide-in-right 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle, #3a3633)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-system)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text, #e0dcd8)' }}>
          Task Graph
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: '1.1rem',
            padding: '2px 6px',
          }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {tasks.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--color-text-muted, #8a8580)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-system)',
            }}
          >
            No tasks yet. Send a message to see task decomposition.
          </div>
        ) : (
          rootTasks.map((node) => renderNode(node, 0))
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle, #3a3633)',
          display: 'flex',
          gap: 12,
          fontSize: '0.75rem',
          color: 'var(--color-text-muted, #8a8580)',
          fontFamily: 'var(--font-system)',
        }}
      >
        <span>{tasks.filter((t) => t.status === 'completed').length}/{tasks.length} done</span>
        <span>{tasks.filter((t) => t.status === 'running').length} running</span>
        <span>{tasks.filter((t) => t.status === 'failed').length} failed</span>
      </div>
    </div>
  );
}
