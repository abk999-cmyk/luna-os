import { PrimitiveProps } from './types';

export function Badge({ id, props }: PrimitiveProps) {
  const label = props.label || props.text || '';
  const variant = props.variant || 'default';

  const styles: Record<string, { bg: string; color: string; border: string }> = {
    default: { bg: 'rgba(126,184,255,0.15)', color: '#7eb8ff', border: 'rgba(126,184,255,0.2)' },
    success: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', border: 'rgba(74,222,128,0.2)' },
    warning: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
    error: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  };
  const s = styles[variant] || styles.default;

  return (
    <span id={id} style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  );
}
