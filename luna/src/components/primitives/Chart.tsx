import { PrimitiveProps } from './types';
import '../../styles/primitives/chart.css';

/** Lightweight chart component. Uses inline SVG for simple charts.
 *  For full charting, recharts can be imported as an optional dependency. */
export function Chart({ id, props, onEvent }: PrimitiveProps) {
  const chartType = props.chartType || 'bar';
  const data: { label: string; value: number }[] = props.data || [];
  const height = props.height || 200;
  const width = props.width || 400;

  if (data.length === 0) {
    return <div className="luna-chart luna-chart--empty" id={id}>No data</div>;
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);

  if (chartType === 'bar') {
    return (
      <div className="luna-chart" id={id} style={{ height, width }}>
        {props.title && <div className="luna-chart__title">{props.title}</div>}
        <svg viewBox={`0 0 ${width} ${height}`} className="luna-chart__svg">
          {data.map((d, i) => {
            const barWidth = (width - 20) / data.length - 4;
            const barHeight = (d.value / maxVal) * (height - 40);
            const x = 10 + i * (barWidth + 4);
            const y = height - 20 - barHeight;
            return (
              <g key={i} onClick={() => onEvent('onElementClick', { index: i, data: d })}>
                <rect
                  x={x} y={y} width={barWidth} height={barHeight}
                  className="luna-chart__bar"
                  rx={2}
                />
                <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" className="luna-chart__label">
                  {d.label.length > 6 ? d.label.slice(0, 6) + '..' : d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (chartType === 'line') {
    const points = data.map((d, i) => {
      const x = 20 + (i / Math.max(data.length - 1, 1)) * (width - 40);
      const y = height - 20 - (d.value / maxVal) * (height - 40);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="luna-chart" id={id} style={{ height, width }}>
        {props.title && <div className="luna-chart__title">{props.title}</div>}
        <svg viewBox={`0 0 ${width} ${height}`} className="luna-chart__svg">
          <polyline points={points} className="luna-chart__line" fill="none" />
          {data.map((d, i) => {
            const x = 20 + (i / Math.max(data.length - 1, 1)) * (width - 40);
            const y = height - 20 - (d.value / maxVal) * (height - 40);
            return (
              <circle
                key={i} cx={x} cy={y} r={4}
                className="luna-chart__dot"
                onClick={() => onEvent('onElementClick', { index: i, data: d })}
              />
            );
          })}
        </svg>
      </div>
    );
  }

  if (chartType === 'pie') {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(cx, cy) - 20;
    let startAngle = 0;

    const colors = ['var(--color-amber-500)', 'var(--color-teal-500)', 'var(--color-sand-600)', 'var(--color-error)', 'var(--color-info)', 'var(--color-success)'];

    return (
      <div className="luna-chart" id={id} style={{ height, width }}>
        {props.title && <div className="luna-chart__title">{props.title}</div>}
        <svg viewBox={`0 0 ${width} ${height}`} className="luna-chart__svg">
          {data.map((d, i) => {
            const angle = (d.value / total) * 2 * Math.PI;
            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(startAngle + angle);
            const y2 = cy + r * Math.sin(startAngle + angle);
            const largeArc = angle > Math.PI ? 1 : 0;
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            startAngle += angle;
            return (
              <path
                key={i} d={path}
                fill={colors[i % colors.length]}
                className="luna-chart__slice"
                onClick={() => onEvent('onElementClick', { index: i, data: d })}
              />
            );
          })}
        </svg>
      </div>
    );
  }

  return <div className="luna-chart" id={id}>Unsupported chart type: {chartType}</div>;
}
