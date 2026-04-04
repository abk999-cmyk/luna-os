import { PrimitiveProps } from './types';

export function Progress({ id, props }: PrimitiveProps) {
  const value = Number(props.value) || 0;
  const max = Number(props.max) || 100;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const label = props.label || '';
  const showValue = props.showValue !== false;
  const variant = props.variant || 'default'; // 'default' | 'success' | 'warning' | 'error'

  const colors: Record<string, string> = {
    default: 'var(--accent-primary, #7eb8ff)',
    success: '#4ade80',
    warning: '#f59e0b',
    error: '#ef4444',
  };
  const color = colors[variant] || colors.default;

  return (
    <div id={id} style={{ width: '100%' }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{
        width: '100%', height: 6, borderRadius: 3,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
