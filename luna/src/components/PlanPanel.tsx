import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import type { PlanTask } from '../stores/taskStore';

interface PlanPanelProps {
  planId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--color-gray-400)',
  active: 'var(--color-info)',
  in_progress: 'var(--color-warning)',
  completed: 'var(--color-success)',
  blocked: 'var(--color-error)',
  cancelled: 'var(--color-gray-500)',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        color: 'var(--color-white)',
        background: STATUS_COLORS[status] ?? 'var(--color-gray-400)',
        lineHeight: 1.4,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function TaskRow({ task }: { task: PlanTask }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = task.risks.length > 0 || task.notes.length > 0;

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-secondary)',
        marginBottom: 'var(--space-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        {hasDetails && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              width: 12,
              textAlign: 'center',
              flexShrink: 0,
              transition: `transform var(--duration-fast) var(--ease-smooth)`,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            {'\u25B6'}
          </span>
        )}
        {!hasDetails && <span style={{ width: 12, flexShrink: 0 }} />}

        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.description}
        </span>

        <StatusBadge status={task.status} />

        {task.effort_estimate && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-ui)',
              color: 'var(--text-tertiary)',
              flexShrink: 0,
            }}
          >
            {task.effort_estimate}
          </span>
        )}
      </div>

      {/* Dependency tags */}
      {task.dependencies.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            flexWrap: 'wrap',
            padding: '0 var(--space-3) var(--space-2) 28px',
          }}
        >
          {task.dependencies.map((dep) => (
            <span
              key={dep}
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-link)',
                background: 'var(--color-teal-50)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {dep}
            </span>
          ))}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3) var(--space-3) 28px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {task.risks.length > 0 && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  color: 'var(--color-error)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Risks
              </div>
              {task.risks.map((risk, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--text-secondary)',
                    paddingLeft: 'var(--space-2)',
                    marginBottom: 2,
                  }}
                >
                  - {risk}
                </div>
              ))}
            </div>
          )}

          {task.notes && (
            <div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                Notes
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {task.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PlanPanel({ planId }: PlanPanelProps) {
  const plan = useTaskStore((s) => s.plans.find((p) => p.id === planId));

  if (!plan) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          padding: 'var(--space-8)',
          textAlign: 'center',
        }}
      >
        No plan found. Ask the agent to create a plan.
      </div>
    );
  }

  const sortedPhases = [...plan.phases].sort((a, b) => a.order - b.order);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'var(--font-ui)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-elevated)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-1)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {plan.title}
          </h2>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            v{plan.version}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {plan.goal}
        </p>
      </div>

      {/* Phases */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)' }}>
        {sortedPhases.map((phase) => (
          <div key={phase.id} style={{ marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--text-accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {phase.name}
              </h3>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {phase.tasks.filter((t) => t.status === 'completed').length}/{phase.tasks.length}
              </span>
            </div>
            {phase.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
