import { useCallback, useRef, useEffect, useState } from 'react';
import type { WindowState } from '../types/window';
import { useWindowStore } from '../stores/windowStore';
import { useAppStore } from '../stores/appStore';
import { useMagneticDrag } from '../hooks/useMagneticDrag';
import { useDropContext } from '../hooks/useDropContext';
import { ResponseDisplay } from './ResponseDisplay';
import { DynamicRenderer } from '../renderer/DynamicRenderer';

interface WindowProps {
  window: WindowState;
}

export function Window({ window: win }: WindowProps) {
  // C7: Use individual selectors to avoid O(n²) re-renders
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const updateWindowSize = useWindowStore((s) => s.updateWindowSize);
  const syncWindowSize = useWindowStore((s) => s.syncWindowSize);
  const windowContent = useWindowStore((s) => s.windowContent);

  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const { startDrag, moveDrag, endDrag, isDragging } = useMagneticDrag();
  const { isDropTarget, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDropContext();

  // Drag handling (magnetic)
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window__controls')) return;
      e.preventDefault();
      focusWindow(win.id);
      startDrag(win.id, e.clientX, e.clientY, win.bounds.x, win.bounds.y);
    },
    [win.id, win.bounds.x, win.bounds.y, focusWindow, startDrag]
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
      moveDrag(e.clientX, e.clientY);
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const newW = resizeRef.current.origW + dx;
        const newH = resizeRef.current.origH + dy;
        updateWindowSize(win.id, newW, newH);
      }
    };

    const onMouseUp = () => {
      endDrag();
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
  }, [win.id, updateWindowSize, syncWindowSize, moveDrag, endDrag]);

  const handleFocus = useCallback(() => {
    focusWindow(win.id);
  }, [win.id, focusWindow]);

  // H15: Maximize/restore toggle
  const [preMaxBounds, setPreMaxBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const updateWindowPosition = useWindowStore((s) => s.updateWindowPosition);

  const handleMaximize = useCallback(() => {
    if (preMaxBounds) {
      // Restore
      updateWindowPosition(win.id, preMaxBounds.x, preMaxBounds.y);
      updateWindowSize(win.id, preMaxBounds.width, preMaxBounds.height);
      setPreMaxBounds(null);
    } else {
      // Save current bounds and maximize
      setPreMaxBounds({ ...win.bounds });
      updateWindowPosition(win.id, 0, 0);
      updateWindowSize(win.id, window.innerWidth, window.innerHeight - 60); // 60px for input bar
    }
  }, [win.id, win.bounds, preMaxBounds, updateWindowPosition, updateWindowSize]);

  const windowGroup = useWindowStore((s) => s.getWindowGroup(win.id));
  const groupSize = windowGroup ? windowGroup.size : 0;

  const className = [
    'window',
    win.focused && 'window--focused',
    win.visibility === 'minimized' && 'window--minimized',
    isDragging() && 'window--dragging',
    groupSize > 0 && 'window--grouped',
    isDropTarget && 'window--drop-target',
  ]
    .filter(Boolean)
    .join(' ');

  const content = windowContent.get(win.id) || '';
  const appInfo = useAppStore((s) => s.getAppByWindowId(win.id));

  return (
    <div
      ref={windowRef}
      className={className}
      style={{
        left: win.bounds.x,
        top: win.bounds.y,
        width: win.bounds.width,
        height: win.bounds.height,
        zIndex: win.focused ? 10000 + win.z_order : 100 + win.z_order,
      }}
      onMouseDown={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {groupSize > 1 && (
        <div className="window__group-badge">{groupSize}</div>
      )}
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
            onClick={(e) => { e.stopPropagation(); handleMaximize(); }}
          />
        </div>
        <div className="window__title">{win.title}</div>
      </div>

      {/* Body */}
      <div className="window__body">
        {win.content_type === 'dynamic_app' && appInfo ? (
          <DynamicRenderer
            spec={appInfo.spec}
            dataContext={appInfo.data}
            appId={appInfo.appId}
          />
        ) : win.content_type === 'response' && content ? (
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
