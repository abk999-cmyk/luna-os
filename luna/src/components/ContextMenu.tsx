import { useState, useEffect } from 'react';
import { GLASS } from './apps/glassStyles';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

let showContextMenu: ((x: number, y: number, items: ContextMenuItem[]) => void) | null = null;

export function triggerContextMenu(e: React.MouseEvent, items: ContextMenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  showContextMenu?.(e.clientX, e.clientY, items);
}

export function ContextMenuProvider() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    showContextMenu = (x, y, items) => setMenu({ x, y, items });
    return () => { showContextMenu = null; };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [menu]);

  if (!menu) return null;

  // Clamp to viewport
  const menuWidth = 180;
  const menuHeight = menu.items.length * 32;
  const x = Math.min(menu.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(menu.y, window.innerHeight - menuHeight - 8);

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: 10001,
      ...GLASS.elevated, borderRadius: 8, padding: '4px 0',
      minWidth: menuWidth, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {menu.items.map((item, i) =>
        item.divider ? (
          <div key={i} style={{ height: 1, background: GLASS.dividerColor, margin: '4px 0' }} />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); setMenu(null); }}
            style={{
              display: 'block', width: '100%', textAlign: 'left' as const,
              padding: '6px 14px', fontSize: 12, background: 'none',
              border: 'none', color: item.danger ? '#ef4444' : 'var(--text-primary)',
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = GLASS.hoverBg as string)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
