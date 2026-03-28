import { useState } from 'react';
import { useShellStore, type ContextItem } from '../stores/shellStore';

interface Props {
  item: ContextItem;
}

export function ContextChip({ item }: Props) {
  const removeContextItem = useShellStore((s) => s.removeContextItem);
  const [showPreview, setShowPreview] = useState(false);

  const chipClass = item.type === 'code' ? 'context-chip--code' : item.type === 'doc' ? 'context-chip--doc' : '';

  const sizeStr = item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(0)}KB`;

  return (
    <div style={{ position: 'relative' }}>
      <div
        className={`context-chip ${chipClass}`}
        onClick={() => setShowPreview(!showPreview)}
      >
        <FileIcon type={item.type} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.filename}
        </span>
        <span style={{ opacity: 0.6 }}>{sizeStr}</span>
        <button
          className="context-chip__remove"
          onClick={(e) => { e.stopPropagation(); removeContextItem(item.id); }}
          title="Remove"
        >
          ×
        </button>
      </div>

      {showPreview && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            width: 300,
            maxHeight: 200,
            marginBottom: 4,
            padding: '8px 10px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3))',
            overflow: 'auto',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.preview || item.content.slice(0, 500)}
          {item.content.length > 500 && (
            <div style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
              ...{item.content.length - 500} more characters
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  if (type === 'code') {
    return (
      <svg className="context-chip__icon" viewBox="0 0 24 24" fill="none" stroke="var(--color-teal-500, #2d8a7e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }
  if (type === 'doc') {
    return (
      <svg className="context-chip__icon" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-500, #d4a574)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  return (
    <svg className="context-chip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}
