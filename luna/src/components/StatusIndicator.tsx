import { useAgentStore } from '../stores/agentStore';

export function StatusIndicator() {
  const status = useAgentStore((s) => s.status);

  const className = [
    'status-dot',
    status === 'working' && 'status-dot--working',
    status === 'streaming' && 'status-dot--streaming',
    status === 'error' && 'status-dot--error',
    status === 'success' && 'status-dot--success',
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className} title={status} />;
}
