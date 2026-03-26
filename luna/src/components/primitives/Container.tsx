import { PrimitiveProps, layoutToStyle } from './types';
import '../../styles/primitives/containers.css';

/** Flex/grid container for layout composition. */
export function Container({ id, props, layout, children }: PrimitiveProps) {
  const style: React.CSSProperties = {
    ...layoutToStyle(layout),
    ...(props.style || {}),
  };

  return (
    <div className={`luna-container ${props.className || ''}`} id={id} style={style}>
      {children || props.children}
    </div>
  );
}

/** CSS Grid container. */
export function Grid({ id, props, children }: PrimitiveProps) {
  const columns = props.columns || 2;
  const gap = props.gap ?? 16;

  return (
    <div
      className={`luna-grid ${props.className || ''}`}
      id={id}
      style={{
        display: 'grid',
        gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, 1fr)` : columns,
        gap: `${gap}px`,
        ...(props.style || {}),
      }}
    >
      {children || props.children}
    </div>
  );
}

/** Visual divider line. */
export function Divider({ id, props }: PrimitiveProps) {
  const vertical = props.direction === 'vertical';
  return (
    <div
      className={`luna-divider ${vertical ? 'luna-divider--vertical' : ''}`}
      id={id}
    />
  );
}

/** Empty space for layout control. */
export function Spacer({ id, props }: PrimitiveProps) {
  const size = props.size ?? 16;
  return (
    <div
      className="luna-spacer"
      id={id}
      style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }}
    />
  );
}
