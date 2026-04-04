import { PrimitiveProps } from './types';

export function Tag({ id, props, onEvent }: PrimitiveProps) {
  const label = props.label || props.text || '';
  const removable = props.removable !== false;
  const color = props.color || 'rgba(126,184,255,0.15)';

  return (
    <span id={id} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6, fontSize: 12,
      background: color, border: '1px solid rgba(255,255,255,0.08)',
      color: 'var(--text-primary)',
    }}>
      {label}
      {removable && (
        <button
          onClick={() => onEvent('onRemove', { label })}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', fontSize: 11, padding: 0,
            lineHeight: 1, display: 'flex',
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
