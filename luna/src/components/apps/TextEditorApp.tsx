import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GLASS } from './glassStyles';
import { sanitizeHtml } from '../../utils/sanitize';
import { useUndoStore } from '../../stores/undoStore';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TabFile {
  id: string;
  name: string;
  content: string;
  language: string;
}

/* ------------------------------------------------------------------ */
/*  Default files                                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_JS = `// main.js — Luna OS entry point
import { createApp } from './framework';
import { Router } from './router';

const config = {
  name: 'Luna OS',
  version: '2.0.0',
  debug: false,
};

async function bootstrap() {
  const app = createApp(config);
  const router = new Router('/');

  // Register routes
  router.add('/home', () => import('./views/Home'));
  router.add('/settings', () => import('./views/Settings'));

  app.use(router);
  await app.mount('#root');

  console.log('Luna OS started successfully');
  return app;
}

bootstrap();
`;

const DEFAULT_NOTES = `Project Notes
=============

TODO:
- Finish the sidebar layout
- Add keyboard shortcuts
- Write unit tests for Router class
- Update documentation

Meeting notes (March 28):
  Discussed new glass UI theme.
  Everyone agreed on the blur + saturation approach.
  Next sprint: performance audit.

Ideas:
  Maybe add a pomodoro timer app?
  System monitor would be cool too.
`;

let nextTabId = 3;

/* ------------------------------------------------------------------ */
/*  Syntax highlighting                                                */
/* ------------------------------------------------------------------ */

function highlightJS(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const escaped = esc(text);

  // Order matters: comments first, then strings, then keywords/numbers
  const tokens: { start: number; end: number; html: string }[] = [];

  // Block comments
  const blockComment = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = blockComment.exec(escaped)) !== null) {
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<span style="color:rgba(255,255,255,0.3)">${m[0]}</span>`,
    });
  }

  // Line comments
  const lineComment = /\/\/[^\n]*/g;
  while ((m = lineComment.exec(escaped)) !== null) {
    if (!tokens.some((t) => m!.index >= t.start && m!.index < t.end)) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        html: `<span style="color:rgba(255,255,255,0.3)">${m[0]}</span>`,
      });
    }
  }

  // Strings (single and double quotes)
  const strRe = /(['"`])(?:(?!\1).)*?\1/g;
  while ((m = strRe.exec(escaped)) !== null) {
    if (!tokens.some((t) => m!.index >= t.start && m!.index < t.end)) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        html: `<span style="color:#a8cc8c">${m[0]}</span>`,
      });
    }
  }

  // Keywords
  const kws =
    /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|true|false|null|undefined|try|catch|throw|switch|case|break|default|typeof|instanceof)\b/g;
  while ((m = kws.exec(escaped)) !== null) {
    if (!tokens.some((t) => m!.index >= t.start && m!.index < t.end)) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        html: `<span style="color:var(--accent-primary)">${m[0]}</span>`,
      });
    }
  }

  // Numbers
  const nums = /\b(\d+\.?\d*)\b/g;
  while ((m = nums.exec(escaped)) !== null) {
    if (!tokens.some((t) => m!.index >= t.start && m!.index < t.end)) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        html: `<span style="color:#d4a574">${m[0]}</span>`,
      });
    }
  }

  // Sort by start position descending so we can replace from end
  tokens.sort((a, b) => b.start - a.start);
  let result = escaped;
  for (const t of tokens) {
    result = result.slice(0, t.start) + t.html + result.slice(t.end);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    ...GLASS.elevated,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderRadius: 0,
    padding: '0 4px',
    flexShrink: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    minHeight: 36,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    border: 'none',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
    flexShrink: 0,
  },
  tabActive: {
    color: 'var(--accent-primary)',
    borderBottom: '2px solid var(--accent-primary)',
  },
  tabClose: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: 4,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
  },
  addTab: {
    ...GLASS.ghostBtn,
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    fontSize: 16,
    padding: 0,
    marginLeft: 4,
    flexShrink: 0,
  },
  editorWrap: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  lineNumbers: {
    ...GLASS.elevated,
    borderRadius: 0,
    borderTop: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    width: 48,
    flexShrink: 0,
    overflowY: 'hidden',
    overflowX: 'hidden',
    padding: '8px 0',
    userSelect: 'none',
  },
  lineNum: {
    display: 'block',
    textAlign: 'right',
    paddingRight: 12,
    paddingLeft: 8,
    fontSize: 12,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    lineHeight: '20px',
    color: 'rgba(255,255,255,0.25)',
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  textarea: {
    ...GLASS.inset,
    borderRadius: 0,
    border: 'none',
    width: '100%',
    height: '100%',
    resize: 'none',
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    lineHeight: '20px',
    color: 'transparent',
    caretColor: 'var(--text-primary)',
    background: 'rgba(0,0,0,0.15)',
    outline: 'none',
    tabSize: 2,
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    overflowX: 'auto',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    lineHeight: '20px',
    color: 'var(--text-primary)',
    background: 'transparent',
    pointerEvents: 'none',
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    overflowX: 'auto',
    zIndex: 1,
    margin: 0,
    border: 'none',
  },
  findBar: {
    ...GLASS.elevated,
    borderRadius: 0,
    borderLeft: 'none',
    borderRight: 'none',
    borderTop: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    flexShrink: 0,
  },
  findInput: {
    ...GLASS.inset,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    flex: 1,
    maxWidth: 240,
    borderRadius: 6,
  },
  findInfo: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    minWidth: 60,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    borderTop: `1px solid ${GLASS.dividerColor}`,
    fontSize: 11,
    color: 'var(--text-secondary)',
    flexShrink: 0,
    gap: 12,
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 4,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TextEditorApp() {
  const [tabs, setTabs] = useState<TabFile[]>([
    { id: '1', name: 'main.js', content: DEFAULT_JS, language: 'javascript' },
    { id: '2', name: 'notes.txt', content: DEFAULT_NOTES, language: 'text' },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [fontSize, setFontSize] = useState(13);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  /* Sync scroll between textarea, line numbers, and highlight overlay */
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (lineRef.current) {
      lineRef.current.scrollTop = ta.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  }, []);

  /* Cursor position tracking */
  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const textBefore = ta.value.slice(0, pos);
    const lines = textBefore.split('\n');
    setCursorLine(lines.length);
    setCursorCol(lines[lines.length - 1].length + 1);
  }, []);

  /* Keyboard shortcut for find */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind((p) => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Find matches */
  const findMatches = useMemo(() => {
    if (!findQuery || !activeTab) return [];
    const matches: number[] = [];
    const lower = activeTab.content.toLowerCase();
    const q = findQuery.toLowerCase();
    let idx = lower.indexOf(q);
    while (idx !== -1) {
      matches.push(idx);
      idx = lower.indexOf(q, idx + 1);
    }
    return matches;
  }, [findQuery, activeTab]);

  const handleFindNav = (dir: 1 | -1) => {
    if (findMatches.length === 0) return;
    setFindIndex((prev) => (prev + dir + findMatches.length) % findMatches.length);
  };

  /* Update file content */
  const updateContent = useCallback(
    (content: string) => {
      const prevContent = activeTab?.content ?? '';
      const tabId = activeTabId;
      useUndoStore.getState().push(`Edit ${activeTab?.name ?? 'file'}`, () => {
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, content: prevContent } : t)));
      });
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, content } : t)));
    },
    [activeTabId, activeTab]
  );

  /* Add new tab */
  const addTab = () => {
    const id = String(nextTabId++);
    const newTab: TabFile = {
      id,
      name: `untitled-${id}.txt`,
      content: '',
      language: 'text',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  /* Close tab */
  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      const idx = tabs.findIndex((t) => t.id === tabId);
      const nextIdx = idx > 0 ? idx - 1 : 1;
      setActiveTabId(tabs[nextIdx]?.id || tabs[0].id);
    }
  };

  /* Line count */
  const lineCount = activeTab ? activeTab.content.split('\n').length : 1;

  /* Highlighted HTML */
  const highlightedHTML = useMemo(() => {
    if (!activeTab) return '';
    if (activeTab.language === 'javascript') {
      return highlightJS(activeTab.content);
    }
    return activeTab.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, [activeTab]);

  const wrapStyle: React.CSSProperties = wordWrap
    ? { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }
    : {};

  return (
    <div style={S.root}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...S.tab,
              ...(tab.id === activeTabId ? S.tabActive : {}),
            }}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>{tab.name}</span>
            <span
              style={S.tabClose}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = GLASS.hoverBg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              x
            </span>
          </button>
        ))}
        <button
          style={S.addTab}
          onClick={addTab}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = GLASS.ghostBtn.background as string;
          }}
        >
          +
        </button>
      </div>

      {/* Find bar */}
      {showFind && (
        <div style={S.findBar}>
          <input
            style={S.findInput}
            placeholder="Find..."
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindIndex(0);
            }}
            autoFocus
          />
          <span style={S.findInfo}>
            {findMatches.length > 0
              ? `${findIndex + 1} of ${findMatches.length}`
              : findQuery
              ? 'No results'
              : ''}
          </span>
          <button style={{ ...GLASS.ghostBtn, padding: '3px 8px', fontSize: 12, borderRadius: 6 }} onClick={() => handleFindNav(-1)}>
            Prev
          </button>
          <button style={{ ...GLASS.ghostBtn, padding: '3px 8px', fontSize: 12, borderRadius: 6 }} onClick={() => handleFindNav(1)}>
            Next
          </button>
          <button
            style={{ ...S.statusBtn, fontSize: 14 }}
            onClick={() => {
              setShowFind(false);
              setFindQuery('');
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Editor */}
      <div style={S.editorWrap as React.CSSProperties}>
        {/* Line numbers */}
        <div ref={lineRef} style={S.lineNumbers}>
          {Array.from({ length: lineCount }, (_, i) => (
            <span
              key={i}
              style={{
                ...S.lineNum,
                fontSize,
                color: i + 1 === cursorLine ? 'var(--text-primary)' : undefined,
              }}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* Code area with highlight overlay */}
        <div style={S.editorContainer as React.CSSProperties}>
          <pre
            ref={highlightRef}
            style={{ ...S.highlight, fontSize, ...wrapStyle } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlightedHTML + '\n') }}
            aria-hidden
          />
          <textarea
            ref={textareaRef}
            style={{ ...S.textarea, fontSize, ...wrapStyle } as React.CSSProperties}
            value={activeTab?.content || ''}
            onChange={(e) => updateContent(e.target.value)}
            onScroll={handleScroll}
            onClick={updateCursor}
            onKeyUp={updateCursor}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Status bar */}
      <div style={S.statusBar}>
        <div style={S.statusLeft}>
          <span>
            Ln {cursorLine}, Col {cursorCol}
          </span>
          <span>{activeTab?.language === 'javascript' ? 'JavaScript' : 'Plain Text'}</span>
          <span>UTF-8</span>
        </div>
        <div style={S.statusRight}>
          <button
            style={S.statusBtn}
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
          >
            A-
          </button>
          <span style={{ fontSize: 11 }}>{fontSize}px</span>
          <button
            style={S.statusBtn}
            onClick={() => setFontSize((s) => Math.min(24, s + 1))}
          >
            A+
          </button>
          <button
            style={{
              ...S.statusBtn,
              color: wordWrap ? 'var(--accent-primary)' : undefined,
            }}
            onClick={() => setWordWrap((w) => !w)}
          >
            Wrap
          </button>
        </div>
      </div>
    </div>
  );
}

export default TextEditorApp;
