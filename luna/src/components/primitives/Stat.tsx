import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

/** Label + value display with optional trend indicator. */
export function Stat({ id, props, onEvent }: PrimitiveProps) {
  const trend = props.trend; // 'up' | 'down' | 'neutral'
  const trendValue = props.trendValue;

  return (
    <div
      className={`luna-stat ${props.clickable ? 'luna-stat--clickable' : ''}`}
      id={id}
      onClick={props.clickable ? () => onEvent('onClick', { id }) : undefined}
    >
      <div className="luna-stat__label">{props.label}</div>
      <div className="luna-stat__value">{props.value}</div>
      {(trend || trendValue) && (
        <div className={`luna-stat__trend luna-stat__trend--${trend || 'neutral'}`}>
          {trend === 'up' && '↑'}
          {trend === 'down' && '↓'}
          {trendValue && <span>{trendValue}</span>}
        </div>
      )}
      {props.description && <div className="luna-stat__description">{props.description}</div>}
    </div>
  );
}
