import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

/** Card with title, body, and optional actions footer. */
export function Card({ id, props, onEvent }: PrimitiveProps) {
  return (
    <div
      className={`luna-card ${props.clickable ? 'luna-card--clickable' : ''}`}
      id={id}
      onClick={props.clickable ? () => onEvent('onClick', { id }) : undefined}
    >
      {(props.title || props.image) && (
        <div className="luna-card__header">
          {props.image && <img className="luna-card__image" src={props.image} alt="" />}
          {props.title && <div className="luna-card__title">{props.title}</div>}
          {props.subtitle && <div className="luna-card__subtitle">{props.subtitle}</div>}
        </div>
      )}
      <div className="luna-card__body">
        {props.content || props.children}
      </div>
      {props.actions && props.actions.length > 0 && (
        <div className="luna-card__footer">
          {props.actions.map((action: { label: string; id: string }, i: number) => (
            <button
              key={i}
              className="luna-card__action"
              onClick={(e) => {
                e.stopPropagation();
                onEvent('onAction', { actionId: action.id, label: action.label });
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
