import { useMemo } from 'react';
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

  // M19: Pre-compute pie slices in useMemo to avoid mutating startAngle during render
  const pieSlices = useMemo(() => {
    if (chartType !== 'pie') return [];
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const pcx = width / 2;
    const pcy = height / 2;
    const pr = Math.min(pcx, pcy) - 20;
    const colors = ['var(--color-amber-500)', 'var(--color-teal-500)', 'var(--color-sand-600)', 'var(--color-error)', 'var(--color-info)', 'var(--color-success)'];
    let angle = 0;
    return data.map((d, i) => {
      const sweep = (d.value / total) * 2 * Math.PI;
      const x1 = pcx + pr * Math.cos(angle);
      const y1 = pcy + pr * Math.sin(angle);
      const x2 = pcx + pr * Math.cos(angle + sweep);
      const y2 = pcy + pr * Math.sin(angle + sweep);
      const largeArc = sweep > Math.PI ? 1 : 0;
      const path = `M ${pcx} ${pcy} L ${x1} ${y1} A ${pr} ${pr} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      angle += sweep;
      return { path, fill: colors[i % colors.length], data: d, index: i };
    });
  }, [chartType, data, width, height]);

  if (chartType === 'pie') {
    return (
      <div className="luna-chart" id={id} style={{ height, width }}>
        {props.title && <div className="luna-chart__title">{props.title}</div>}
        <svg viewBox={`0 0 ${width} ${height}`} className="luna-chart__svg">
          {pieSlices.map((slice) => (
            <path
              key={slice.index} d={slice.path}
              fill={slice.fill}
              className="luna-chart__slice"
              onClick={() => onEvent('onElementClick', { index: slice.index, data: slice.data })}
            />
          ))}
        </svg>
      </div>
    );
  }

  return <div className="luna-chart" id={id}>Unsupported chart type: {chartType}</div>;
}
