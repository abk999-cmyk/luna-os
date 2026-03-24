import { useCallback, useRef, useEffect } from 'react';
import type { WindowState } from '../types/window';
import { useWindowStore } from '../stores/windowStore';
import { ResponseDisplay } from './ResponseDisplay';

interface WindowProps {
  window: WindowState;
}

export function Window({ window: win }: WindowProps) {
  const {
    removeWindow,
    minimizeWindow,
    focusWindow,
    updateWindowPosition,
    updateWindowSize,
    syncWindowPosition,
    syncWindowSize,
    windowContent,
  } = useWindowStore();

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // Drag handling
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window__controls')) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: win.bounds.x,
        origY: win.bounds.y,
      };
    },
    [win.id, win.bounds.x, win.bounds.y, focusWindow]
  );

  // Resize handling
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: win.bounds.width,
        origH: win.bounds.height,
      };
    },
    [win.id, win.bounds.width, win.bounds.height, focusWindow]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newX = Math.max(0, dragRef.current.origX + dx);
        const newY = Math.max(0, dragRef.current.origY + dy);
        updateWindowPosition(win.id, newX, newY);
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const newW = resizeRef.current.origW + dx;
        const newH = resizeRef.current.origH + dy;
        updateWindowSize(win.id, newW, newH);
      }
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        // Sync final position to backend
        const w = useWindowStore.getState().windows.find((w) => w.id === win.id);
        if (w) syncWindowPosition(win.id, w.bounds.x, w.bounds.y);
        dragRef.current = null;
      }
      if (resizeRef.current) {
        const w = useWindowStore.getState().windows.find((w) => w.id === win.id);
        if (w) syncWindowSize(win.id, w.bounds.width, w.bounds.height);
        resizeRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [win.id, updateWindowPosition, updateWindowSize, syncWindowPosition, syncWindowSize]);

  const handleFocus = useCallback(() => {
    focusWindow(win.id);
  }, [win.id, focusWindow]);

  const className = [
    'window',
    win.focused && 'window--focused',
    win.visibility === 'minimized' && 'window--minimized',
    (dragRef.current !== null) && 'window--dragging',
  ]
    .filter(Boolean)
    .join(' ');

  const content = windowContent.get(win.id) || '';

  return (
    <div
      ref={windowRef}
      className={className}
      style={{
        left: win.bounds.x,
        top: win.bounds.y,
        width: win.bounds.width,
        height: win.bounds.height,
        zIndex: win.focused ? 200 : 100 + win.z_order,
      }}
      onMouseDown={handleFocus}
    >
      {/* Title Bar */}
      <div className="window__chrome" onMouseDown={onDragStart}>
        <div className="window__controls">
          <button
            className="window__control window__control--close"
            onClick={(e) => { e.stopPropagation(); removeWindow(win.id); }}
          />
          <button
            className="window__control window__control--minimize"
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
          />
          <button
            className="window__control window__control--maximize"
            onClick={(e) => { e.stopPropagation(); }}
          />
        </div>
        <div className="window__title">{win.title}</div>
      </div>

      {/* Body */}
      <div className="window__body">
        {win.content_type === 'response' && content ? (
          <ResponseDisplay text={content} />
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-system)', fontSize: 'var(--text-sm)' }}>
            {content || 'Empty window'}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div className="window__resize-handle" onMouseDown={onResizeStart} />
    </div>
  );
}
