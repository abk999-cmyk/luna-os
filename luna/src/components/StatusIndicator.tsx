import { useAgentStore, type AgentStatus } from '../stores/agentStore';

export function StatusIndicator() {
  const status = useAgentStore((s) => s.status);

  const className = [
    'status-dot',
    status === 'working' && 'status-dot--working',
    status === 'error' && 'status-dot--error',
    status === 'success' && 'status-dot--success',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className} title={status} />;
}
