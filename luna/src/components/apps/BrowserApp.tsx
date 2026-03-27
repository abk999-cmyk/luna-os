import React, { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Bookmark {
  title: string;
  url: string;
}

interface Tab {
  title: string;
  url: string;
}

interface BrowserProps {
  url?: string;
  bookmarks?: Bookmark[];
  tabs?: Tab[];
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
];

const HOME_URL = 'https://www.google.com';

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--surface-base, #1a1614)',
    color: 'var(--text-primary, #e8e0d8)',
    fontFamily: 'var(--font-system, system-ui)',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid var(--border-subtle, #3a332e)',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface-elevated, #2a2420)',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    flexShrink: 0,
    overflowX: 'auto',
    minHeight: 36,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
    borderRight: '1px solid var(--border-subtle, #3a332e)',
    maxWidth: 180,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    flexShrink: 0,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-secondary, #b0a898)',
    fontFamily: 'var(--font-system, system-ui)',
  },
  tabActive: {
    background: 'var(--surface-base, #1a1614)',
    color: 'var(--text-primary, #e8e0d8)',
    borderBottom: '2px solid var(--color-accent, #d4a574)',
  },
  tabClose: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary, #6a6058)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    lineHeight: 1,
    fontFamily: 'var(--font-system, system-ui)',
    marginLeft: 4,
  },
  newTabBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary, #6a6058)',
    cursor: 'pointer',
    fontSize: 18,
    padding: '4px 10px',
    fontFamily: 'var(--font-system, system-ui)',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    background: 'var(--surface-elevated, #2a2420)',
    flexShrink: 0,
  },
  navBtn: {
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    width: 30,
    height: 30,
    cursor: 'pointer',
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-system, system-ui)',
    flexShrink: 0,
  },
  navBtnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  urlInput: {
    flex: 1,
    background: 'var(--surface-base, #1a1614)',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    padding: '6px 12px',
    color: 'var(--text-primary, #e8e0d8)',
    fontSize: 13,
    fontFamily: 'var(--font-mono, monospace)',
    outline: 'none',
    minWidth: 0,
  },
  bookmarksBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    overflowX: 'auto',
    flexShrink: 0,
  },
  bookmarkBtn: {
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    padding: '3px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--font-system, system-ui)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  loadingBar: {
    height: 2,
    background: 'var(--color-accent, #d4a574)',
    transition: 'width 0.3s ease',
    flexShrink: 0,
  },
  iframe: {
    flex: 1,
    border: 'none',
    background: '#fff',
  },
  fallback: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-tertiary, #6a6058)',
    padding: 40,
    textAlign: 'center',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary, #e8e0d8)',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BrowserApp({ url: urlProp, bookmarks: bmProp, tabs: tabsProp }: BrowserProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalProps = useRef<string>(JSON.stringify({ urlProp, bmProp, tabsProp }));

  const initTabs: Tab[] = tabsProp ?? [{ title: 'New Tab', url: urlProp ?? HOME_URL }];
  const [tabs, setTabs] = useState<Tab[]>(initTabs);
  const [activeTab, setActiveTab] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(bmProp ?? DEFAULT_BOOKMARKS);
  const [urlBar, setUrlBar] = useState(initTabs[0].url);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const [, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify({ urlProp, bmProp, tabsProp });
    if (serialized === lastExternalProps.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalProps.current = serialized;
    if (tabsProp) {
      setTabs(tabsProp);
      setUrlBar(tabsProp[0]?.url ?? HOME_URL);
      setActiveTab(0);
    } else if (urlProp) {
      setTabs([{ title: titleFromUrl(urlProp), url: urlProp }]);
      setUrlBar(urlProp);
      setActiveTab(0);
    }
    if (bmProp) setBookmarks(bmProp);
  }, [urlProp, bmProp, tabsProp]);

  const currentUrl = tabs[activeTab]?.url ?? HOME_URL;

  // Simulate loading
  const simulateLoad = useCallback(() => {
    setLoading(true);
    setLoadProgress(0);
    setIframeError(false);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30 + 10;
      if (progress >= 100) {
        setLoadProgress(100);
        setLoading(false);
        clearInterval(interval);
      } else {
        setLoadProgress(progress);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const navigate = useCallback((url: string) => {
    isInternalEdit.current = true;
    let finalUrl = url.trim();
    if (finalUrl && !finalUrl.match(/^https?:\/\//)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    setHistoryStack(prev => [...prev, currentUrl]);
    setForwardStack([]);
    setTabs(prev => prev.map((t, i) => i === activeTab ? { ...t, url: finalUrl, title: titleFromUrl(finalUrl) } : t));
    setUrlBar(finalUrl);
    simulateLoad();
  }, [activeTab, currentUrl, simulateLoad]);

  const goBack = useCallback(() => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setForwardStack(f => [...f, currentUrl]);
    setHistoryStack(h => h.slice(0, -1));
    setTabs(ts => ts.map((t, i) => i === activeTab ? { ...t, url: prev, title: titleFromUrl(prev) } : t));
    setUrlBar(prev);
    simulateLoad();
  }, [historyStack, currentUrl, activeTab, simulateLoad]);

  const goForward = useCallback(() => {
    if (forwardStack.length === 0) return;
    const next = forwardStack[forwardStack.length - 1];
    setHistoryStack(h => [...h, currentUrl]);
    setForwardStack(f => f.slice(0, -1));
    setTabs(ts => ts.map((t, i) => i === activeTab ? { ...t, url: next, title: titleFromUrl(next) } : t));
    setUrlBar(next);
    simulateLoad();
  }, [forwardStack, currentUrl, activeTab, simulateLoad]);

  const refresh = useCallback(() => {
    simulateLoad();
    // Force iframe reload by toggling key
    setTabs(prev => [...prev]);
  }, [simulateLoad]);

  const goHome = useCallback(() => navigate(HOME_URL), [navigate]);

  const addTab = useCallback(() => {
    isInternalEdit.current = true;
    const t: Tab = { title: 'New Tab', url: HOME_URL };
    setTabs(prev => [...prev, t]);
    setActiveTab(tabs.length);
    setUrlBar(HOME_URL);
    simulateLoad();
  }, [tabs.length, simulateLoad]);

  const closeTab = useCallback((idx: number) => {
    if (tabs.length <= 1) return;
    const next = tabs.filter((_, i) => i !== idx);
    setTabs(next);
    if (activeTab >= next.length) setActiveTab(next.length - 1);
    else if (idx < activeTab) setActiveTab(activeTab - 1);
    setUrlBar(next[Math.min(activeTab, next.length - 1)].url);
  }, [tabs, activeTab]);

  const switchTab = useCallback((idx: number) => {
    setActiveTab(idx);
    setUrlBar(tabs[idx].url);
    setHistoryStack([]);
    setForwardStack([]);
  }, [tabs]);

  const addBookmark = useCallback(() => {
    isInternalEdit.current = true;
    const t = tabs[activeTab];
    if (!t) return;
    if (bookmarks.some(b => b.url === t.url)) return;
    setBookmarks(prev => [...prev, { title: t.title, url: t.url }]);
  }, [tabs, activeTab, bookmarks]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(urlBar);
  };

  return (
    <div style={S.root}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        {tabs.map((t, i) => (
          <div
            key={i}
            style={{ ...S.tab, ...(i === activeTab ? S.tabActive : {}), display: 'flex', alignItems: 'center' }}
            onClick={() => switchTab(i)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {t.title}
            </span>
            {tabs.length > 1 && (
              <button
                style={S.tabClose}
                onClick={e => { e.stopPropagation(); closeTab(i); }}
              >
                \u00d7
              </button>
            )}
          </div>
        ))}
        <button style={S.newTabBtn} onClick={addTab} title="New tab">+</button>
      </div>

      {/* Navigation bar */}
      <div style={S.navBar}>
        <button
          style={{ ...S.navBtn, ...(historyStack.length === 0 ? S.navBtnDisabled : {}) }}
          onClick={goBack}
          disabled={historyStack.length === 0}
          title="Back"
        >
          \u2190
        </button>
        <button
          style={{ ...S.navBtn, ...(forwardStack.length === 0 ? S.navBtnDisabled : {}) }}
          onClick={goForward}
          disabled={forwardStack.length === 0}
          title="Forward"
        >
          \u2192
        </button>
        <button style={S.navBtn} onClick={refresh} title="Refresh">
          {loading ? '\u25a0' : '\u21bb'}
        </button>
        <button style={S.navBtn} onClick={goHome} title="Home">
          \u2302
        </button>
        <form onSubmit={handleUrlSubmit} style={{ flex: 1, display: 'flex' }}>
          <input
            style={S.urlInput}
            value={urlBar}
            onChange={e => setUrlBar(e.target.value)}
            placeholder="Enter URL or search\u2026"
          />
        </form>
        <button style={S.navBtn} onClick={addBookmark} title="Bookmark this page">
          \u2606
        </button>
      </div>

      {/* Bookmarks bar */}
      {bookmarks.length > 0 && (
        <div style={S.bookmarksBar}>
          {bookmarks.map((b, i) => (
            <button
              key={i}
              style={S.bookmarkBtn}
              onClick={() => navigate(b.url)}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,165,116,0.10)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              {b.title}
            </button>
          ))}
        </div>
      )}

      {/* Loading bar */}
      {loading && (
        <div style={{ ...S.loadingBar, width: `${loadProgress}%` }} />
      )}

      {/* Content */}
      <iframe
        ref={iframeRef}
        key={currentUrl}
        src={currentUrl}
        style={S.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Browser content"
        onLoad={() => { setLoading(false); setLoadProgress(100); }}
        onError={() => { setIframeError(true); setLoading(false); }}
      />
    </div>
  );
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

export default BrowserApp;
