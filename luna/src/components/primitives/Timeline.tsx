import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

interface TimelineItem {
  title: string;
  subtitle?: string;
  description?: string;
  time?: string;
  status?: 'completed' | 'active' | 'pending';
}

/** Vertical timeline with status indicators. */
export function Timeline({ id, props, onEvent }: PrimitiveProps) {
  const items: TimelineItem[] = props.items || [];
  const direction = props.direction || 'vertical';

  return (
    <div className={`luna-timeline luna-timeline--${direction}`} id={id}>
      {items.map((item, i) => (
        <div
          key={i}
          className={`luna-timeline__item luna-timeline__item--${item.status || 'pending'}`}
          onClick={() => onEvent('onItemClick', { index: i, item })}
        >
          <div className="luna-timeline__marker">
            <div className="luna-timeline__dot" />
            {i < items.length - 1 && <div className="luna-timeline__line" />}
          </div>
          <div className="luna-timeline__content">
            <div className="luna-timeline__title">{item.title}</div>
            {item.subtitle && <div className="luna-timeline__subtitle">{item.subtitle}</div>}
            {item.description && <div className="luna-timeline__description">{item.description}</div>}
            {item.time && <div className="luna-timeline__time">{item.time}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
