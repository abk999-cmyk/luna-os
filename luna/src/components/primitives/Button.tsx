import { PrimitiveProps } from './types';

/** Button component with variant support (primary, secondary, danger). */
export function Button({ id, props, onEvent }: PrimitiveProps) {
  const variant = props.variant || 'primary';
  const label = props.label || props.text || 'Button';
  const disabled = props.disabled || false;

  const baseStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-system, system-ui)',
    fontSize: 'var(--text-sm, 13px)',
    fontWeight: 600,
    transition: 'background 0.15s, opacity 0.15s',
    opacity: disabled ? 0.5 : 1,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-accent, #d4a574)',
      color: 'var(--surface-base, #1a1614)',
    },
    secondary: {
      background: 'var(--surface-elevated, #2a2420)',
      color: 'var(--text-primary, #e8e0d8)',
      border: '1px solid var(--border-subtle, #3a332e)',
    },
    danger: {
      background: 'var(--color-error, #e05252)',
      color: '#fff',
    },
  };

  return (
    <button
      id={id}
      disabled={disabled}
      style={{ ...baseStyle, ...(variantStyles[variant] || variantStyles.primary) }}
      onClick={() => onEvent('onClick', { id })}
    >
      {label}
    </button>
  );
}
