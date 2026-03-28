import { useCallback, useRef, useEffect, useState, lazy, Suspense, useMemo } from 'react';
import type { WindowState } from '../types/window';
import { useWindowStore } from '../stores/windowStore';
import { useAppStore } from '../stores/appStore';
import { useMagneticDrag } from '../hooks/useMagneticDrag';
import { useDropContext } from '../hooks/useDropContext';
import { useWindowAgentPresence } from '../hooks/useWindowAgentPresence';
import { ResponseDisplay } from './ResponseDisplay';
import { DynamicRenderer } from '../renderer/DynamicRenderer';
import { RichTextEditor } from './RichTextEditor';
import { TerminalView } from './WindowTerminalView';
import { CanvasView } from './WindowCanvasView';
import { ScratchpadView } from './WindowScratchpadView';
import { MemoryInspector } from './trust/MemoryInspector';

// Lazy-load heavy app components
const SpreadsheetApp = lazy(() => import('./apps/SpreadsheetApp').then(m => ({ default: m.SpreadsheetApp })));
const SlidesApp = lazy(() => import('./apps/SlidesApp').then(m => ({ default: m.SlidesApp })));
const EmailApp = lazy(() => import('./apps/EmailApp').then(m => ({ default: m.EmailApp })));
const CalendarApp = lazy(() => import('./apps/CalendarApp').then(m => ({ default: m.CalendarApp })));
const FileManagerApp = lazy(() => import('./apps/FileManagerApp').then(m => ({ default: m.FileManagerApp })));
const KanbanApp = lazy(() => import('./apps/KanbanApp').then(m => ({ default: m.KanbanApp })));
const NotesApp = lazy(() => import('./apps/NotesApp').then(m => ({ default: m.NotesApp })));
const CalculatorApp = lazy(() => import('./apps/CalculatorApp').then(m => ({ default: m.CalculatorApp })));
const BrowserApp = lazy(() => import('./apps/BrowserApp').then(m => ({ default: m.BrowserApp })));
const MusicPlayerApp = lazy(() => import('./apps/MusicPlayerApp').then(m => ({ default: m.MusicPlayerApp })));

/** Try to parse JSON content, return null if invalid */
function tryParseJson(content: string): any | null {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    // Try to find JSON within the content (LLM sometimes wraps in extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { return null; }
    }
    return null;
  }
}

/** Loading spinner for lazy-loaded apps */
function AppLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-tertiary, #6a6058)',
      fontFamily: 'var(--font-system)', fontSize: '13px',
    }}>
      Loading app...
    </div>
  );
}

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
  const setWindowContent = useWindowStore((s) => s.setWindowContent);

  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const { startDrag, moveDrag, endDrag, isDragging } = useMagneticDrag();
  const { isDropTarget, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDropContext();
  const agentPresence = useWindowAgentPresence(win.id);

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
    agentPresence?.active && 'window--agent-active',
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
        <div className="window__controls window__chrome-controls">
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
        {agentPresence?.active && (
          <div className="window__agent-badge">
            <span className="window__agent-badge-dot" />
            Luna working
          </div>
        )}
      </div>

      {/* Body */}
      <div className="window__body">
        <WindowBody
          win={win}
          content={content}
          appInfo={appInfo}
          setWindowContent={setWindowContent}
        />
      </div>

      {/* Resize Handle */}
      <div className="window__resize-handle" onMouseDown={onResizeStart} />
    </div>
  );
}

/** Route content_type to the appropriate app component */
function WindowBody({
  win,
  content,
  appInfo,
  setWindowContent,
}: {
  win: WindowState;
  content: string;
  appInfo: ReturnType<typeof useAppStore.getState>['getAppByWindowId'] extends (...a: any[]) => infer R ? R : never;
  setWindowContent: (id: string, content: string) => void;
}) {
  // Parse JSON content once for app types
  const parsedData = useMemo(() => {
    if (['spreadsheet', 'slides', 'email', 'calendar', 'file_manager', 'kanban', 'notes', 'calculator', 'browser', 'music', 'code_editor'].includes(win.content_type || '')) {
      return tryParseJson(content);
    }
    return null;
  }, [content, win.content_type]);

  // Dynamic app (app.create)
  if (win.content_type === 'dynamic_app' && appInfo) {
    return (
      <DynamicRenderer
        spec={appInfo.spec}
        dataContext={appInfo.data}
        appId={appInfo.appId}
      />
    );
  }

  // Response display
  if (win.content_type === 'response' && content) {
    return <ResponseDisplay text={content} />;
  }

  // Rich text editor (markdown)
  if (win.content_type === 'editor') {
    return (
      <RichTextEditor
        initialContent={content}
        onChange={(html) => setWindowContent(win.id, html)}
      />
    );
  }

  // Spreadsheet
  if (win.content_type === 'spreadsheet') {
    return (
      <Suspense fallback={<AppLoader />}>
        <SpreadsheetApp
          initialData={parsedData?.data}
          sheets={parsedData?.sheets}
          onChange={(sheet, cell, val) => {
            // Update content in store
            const current = tryParseJson(content) || { sheets: ['Sheet1'], data: {} };
            if (!current.data[sheet]) current.data[sheet] = {};
            current.data[sheet][cell] = { value: val };
            setWindowContent(win.id, JSON.stringify(current));
          }}
        />
      </Suspense>
    );
  }

  // Slides
  if (win.content_type === 'slides') {
    return (
      <Suspense fallback={<AppLoader />}>
        <SlidesApp
          slides={parsedData?.slides}
          currentSlide={parsedData?.currentSlide}
          onChange={(slides) => {
            setWindowContent(win.id, JSON.stringify({ slides }));
          }}
        />
      </Suspense>
    );
  }

  // Email
  if (win.content_type === 'email') {
    return (
      <Suspense fallback={<AppLoader />}>
        <EmailApp
          emails={parsedData?.emails}
          folders={parsedData?.folders}
          onSend={(draft) => { console.log('Email sent:', draft); }}
          onChange={(emails) => {
            setWindowContent(win.id, JSON.stringify({ emails }));
          }}
        />
      </Suspense>
    );
  }

  // Calendar
  if (win.content_type === 'calendar') {
    return (
      <Suspense fallback={<AppLoader />}>
        <CalendarApp
          events={parsedData?.events}
          view={parsedData?.view}
          selectedDate={parsedData?.selectedDate}
          onChange={(events) => {
            setWindowContent(win.id, JSON.stringify({ events, view: parsedData?.view }));
          }}
        />
      </Suspense>
    );
  }

  // File Manager
  if (win.content_type === 'file_manager') {
    return (
      <Suspense fallback={<AppLoader />}>
        <FileManagerApp
          files={parsedData?.files}
          currentPath={parsedData?.currentPath}
          viewMode={parsedData?.viewMode}
          onChange={(files) => {
            setWindowContent(win.id, JSON.stringify({ files }));
          }}
        />
      </Suspense>
    );
  }

  // Kanban
  if (win.content_type === 'kanban') {
    return (
      <Suspense fallback={<AppLoader />}>
        <KanbanApp
          columns={parsedData?.columns}
          onChange={(columns) => {
            setWindowContent(win.id, JSON.stringify({ columns }));
          }}
        />
      </Suspense>
    );
  }

  // Notes
  if (win.content_type === 'notes') {
    return (
      <Suspense fallback={<AppLoader />}>
        <NotesApp
          notes={parsedData?.notes}
          onChange={(notes) => {
            setWindowContent(win.id, JSON.stringify({ notes }));
          }}
        />
      </Suspense>
    );
  }

  // Calculator
  if (win.content_type === 'calculator') {
    return (
      <Suspense fallback={<AppLoader />}>
        <CalculatorApp
          mode={parsedData?.mode}
          history={parsedData?.history}
        />
      </Suspense>
    );
  }

  // Browser
  if (win.content_type === 'browser') {
    return (
      <Suspense fallback={<AppLoader />}>
        <BrowserApp
          url={parsedData?.url}
        />
      </Suspense>
    );
  }

  // Music Player
  if (win.content_type === 'music') {
    return (
      <Suspense fallback={<AppLoader />}>
        <MusicPlayerApp
          playlist={parsedData?.playlist}
          currentIndex={parsedData?.currentIndex}
          isPlaying={parsedData?.isPlaying}
          volume={parsedData?.volume}
        />
      </Suspense>
    );
  }

  // Terminal
  if (win.content_type === 'terminal') {
    return <TerminalView content={content} />;
  }

  // Canvas
  if (win.content_type === 'canvas') {
    return <CanvasView content={content} onChange={(c) => setWindowContent(win.id, c)} />;
  }

  // Memory Inspector
  if (win.content_type === 'memory_inspector') {
    return <MemoryInspector />;
  }

  // Scratchpad
  if (win.content_type === 'scratchpad') {
    return (
      <ScratchpadView
        content={content}
        onChange={(text) => setWindowContent(win.id, text)}
      />
    );
  }

  // Default: panel or unknown type
  return (
    <div style={{
      color: content ? 'var(--text-primary)' : 'var(--text-tertiary)',
      fontFamily: 'var(--font-system)',
      fontSize: 'var(--text-sm)',
      padding: '12px',
      lineHeight: '1.6',
      whiteSpace: 'pre-wrap',
    }}>
      {content || 'Empty window'}
    </div>
  );
}
