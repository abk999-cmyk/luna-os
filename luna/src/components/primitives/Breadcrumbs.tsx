import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

/** Breadcrumb path navigation. */
export function Breadcrumbs({ id, props, onEvent }: PrimitiveProps) {
  const items: { label: string; id?: string }[] = (props.items || []).map((item: any) =>
    typeof item === 'string' ? { label: item } : item
  );
  const separator = props.separator || '/';

  return (
    <nav className="luna-breadcrumbs" id={id} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="luna-breadcrumbs__item">
          {i > 0 && <span className="luna-breadcrumbs__separator">{separator}</span>}
          {i < items.length - 1 ? (
            <button
              className="luna-breadcrumbs__link"
              onClick={() => onEvent('onNavigate', { index: i, item })}
            >
              {item.label}
            </button>
          ) : (
            <span className="luna-breadcrumbs__current" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
