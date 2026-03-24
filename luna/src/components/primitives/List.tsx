import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

/** Ordered or unordered list with clickable items. */
export function List({ id, props, onEvent }: PrimitiveProps) {
  const items: any[] = props.items || [];
  const ordered = props.ordered ?? false;
  const Tag = ordered ? 'ol' : 'ul';

  return (
    <Tag className={`luna-list ${props.className || ''}`} id={id}>
      {items.map((item: any, i: number) => {
        const label = typeof item === 'string' ? item : item.label || item.text || String(item);
        const itemId = typeof item === 'object' ? item.id : i;
        return (
          <li
            key={i}
            className={`luna-list__item ${props.clickable ? 'luna-list__item--clickable' : ''}`}
            onClick={props.clickable ? () => onEvent('onItemClick', { index: i, item, id: itemId }) : undefined}
          >
            {props.renderBullet && <span className="luna-list__bullet">{props.renderBullet}</span>}
            <span className="luna-list__text">{label}</span>
            {typeof item === 'object' && item.secondary && (
              <span className="luna-list__secondary">{item.secondary}</span>
            )}
          </li>
        );
      })}
    </Tag>
  );
}
