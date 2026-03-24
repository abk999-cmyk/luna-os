import { useEffect } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/modal.css';

/** Modal overlay dialog with title, body, and action buttons. */
export function Modal({ id, props, onEvent }: PrimitiveProps) {
  const open = props.open ?? true;

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && props.closable !== false) {
        onEvent('onClose', {});
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, props.closable, onEvent]);

  if (!open) return null;

  return (
    <div className="luna-modal__overlay" id={id} onClick={(e) => {
      if (e.target === e.currentTarget && props.closable !== false) {
        onEvent('onClose', {});
      }
    }}>
      <div className={`luna-modal ${props.size === 'large' ? 'luna-modal--large' : ''}`}>
        <div className="luna-modal__header">
          <div className="luna-modal__title">{props.title}</div>
          {props.closable !== false && (
            <button className="luna-modal__close" onClick={() => onEvent('onClose', {})}>
              &times;
            </button>
          )}
        </div>
        <div className="luna-modal__body">
          {props.content || props.children}
        </div>
        {props.actions && props.actions.length > 0 && (
          <div className="luna-modal__footer">
            {props.actions.map((action: { label: string; id: string; variant?: string }, i: number) => (
              <button
                key={i}
                className={`luna-modal__action ${action.variant === 'primary' ? 'luna-modal__action--primary' : ''}`}
                onClick={() => onEvent('onAction', { actionId: action.id, label: action.label })}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
