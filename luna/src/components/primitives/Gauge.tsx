import { PrimitiveProps } from './types';
import '../../styles/primitives/chart.css';

/** Circular gauge/progress indicator. */
export function Gauge({ id, props }: PrimitiveProps) {
  const value = props.value ?? 0;
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const size = props.size ?? 120;
  const strokeWidth = props.strokeWidth ?? 10;

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  return (
    <div className="luna-gauge" id={id} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="luna-gauge__track"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="luna-gauge__fill"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="luna-gauge__value">
        {props.label || `${Math.round(pct * 100)}%`}
      </div>
    </div>
  );
}
