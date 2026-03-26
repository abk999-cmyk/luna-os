import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

/** Titled container with header and body sections. */
export function Panel({ id, props, onEvent, children }: PrimitiveProps) {
  return (
    <div className={`luna-panel ${props.variant === 'outlined' ? 'luna-panel--outlined' : ''}`} id={id}>
      {props.title && (
        <div className="luna-panel__header">
          <span className="luna-panel__title">{props.title}</span>
          {props.subtitle && <span className="luna-panel__subtitle">{props.subtitle}</span>}
          {props.collapsible && (
            <button
              className="luna-panel__toggle"
              onClick={() => onEvent('onToggle', { collapsed: !props.collapsed })}
            >
              {props.collapsed ? '+' : '-'}
            </button>
          )}
        </div>
      )}
      {!props.collapsed && (
        <div className="luna-panel__body">
          {children || props.children}
        </div>
      )}
    </div>
  );
}
