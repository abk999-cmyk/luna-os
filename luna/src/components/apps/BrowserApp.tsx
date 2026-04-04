import React, { useState, useCallback, useRef, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAgentStore } from '../../stores/agentStore';
import { sendMessageStreaming } from '../../ipc/agent';
import { GLASS } from './glassStyles';

interface BrowserProps {
  url?: string;
}

const HOME_URL = 'https://www.google.com';

// Sites known to block iframe embedding via X-Frame-Options / CSP
const BLOCKED_HOSTS = [
  'youtube.com', 'google.com', 'facebook.com', 'twitter.com', 'x.com',
  'instagram.com', 'reddit.com', 'github.com', 'linkedin.com', 'amazon.com',
  'netflix.com', 'spotify.com', 'twitch.tv', 'discord.com', 'slack.com',
];

function isLikelyBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKED_HOSTS.some(b => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function BrowserApp({ url: urlProp }: BrowserProps) {
  const [currentUrl, setCurrentUrl] = useState(urlProp || HOME_URL);
  const [urlBar, setUrlBar] = useState(urlProp || HOME_URL);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<{url: string; title: string}[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const simulateLoad = useCallback(() => {
    setLoading(true);
    setLoadProgress(0);
    if (loadTimerRef.current) clearInterval(loadTimerRef.current);
    let progress = 0;
    loadTimerRef.current = setInterval(() => {
      progress += Math.random() * 30 + 10;
      if (progress >= 100) {
        setLoadProgress(100);
        setLoading(false);
        if (loadTimerRef.current) clearInterval(loadTimerRef.current);
      } else {
        setLoadProgress(progress);
      }
    }, 200);
  }, []);

  const navigate = useCallback((url: string) => {
    let finalUrl = url.trim();
    if (!finalUrl) return;
    if (!finalUrl.match(/^https?:\/\//)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    setHistoryStack(prev => [...prev, currentUrl]);
    setForwardStack([]);
    setCurrentUrl(finalUrl);
    setUrlBar(finalUrl);
    setBlocked(isLikelyBlocked(finalUrl));
    simulateLoad();
  }, [currentUrl, simulateLoad]);

  // Check initial URL
  useEffect(() => {
    setBlocked(isLikelyBlocked(currentUrl));
  }, []);

  const goBack = useCallback(() => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setForwardStack(f => [...f, currentUrl]);
    setHistoryStack(h => h.slice(0, -1));
    setCurrentUrl(prev);
    setUrlBar(prev);
    setBlocked(isLikelyBlocked(prev));
    simulateLoad();
  }, [historyStack, currentUrl, simulateLoad]);

  const goForward = useCallback(() => {
    if (forwardStack.length === 0) return;
    const next = forwardStack[forwardStack.length - 1];
    setHistoryStack(h => [...h, currentUrl]);
    setForwardStack(f => f.slice(0, -1));
    setCurrentUrl(next);
    setUrlBar(next);
    setBlocked(isLikelyBlocked(next));
    simulateLoad();
  }, [forwardStack, currentUrl, simulateLoad]);

  const openExternal = useCallback(() => {
    openUrl(currentUrl).catch(console.error);
  }, [currentUrl]);

  const askLunaAboutPage = useCallback(async () => {
    const message = `Analyze this webpage for me: ${currentUrl}`;
    useAgentStore.getState().addChatMessage('user', message);
    useAgentStore.getState().setStatus('streaming');
    try {
      await sendMessageStreaming(message);
    } catch (e) {
      console.error('Failed to ask Luna:', e);
    }
  }, [currentUrl]);

  const domain = extractDomain(currentUrl);

  return (
    <div style={{
      ...GLASS.appRoot,
    }}>
      {/* Navigation bar */}
      <div style={{
        ...GLASS.elevated,
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
        borderBottom: `1px solid ${GLASS.dividerColor}`,
        flexShrink: 0,
      }}>
        <NavBtn onClick={goBack} disabled={historyStack.length === 0} title="Back">{'\u2190'}</NavBtn>
        <NavBtn onClick={goForward} disabled={forwardStack.length === 0} title="Forward">{'\u2192'}</NavBtn>
        <NavBtn onClick={() => blocked ? openExternal() : simulateLoad()} title={blocked ? 'Open in browser' : 'Refresh'}>
          {blocked ? '\u2197' : loading ? '\u25a0' : '\u21bb'}
        </NavBtn>
        <NavBtn onClick={() => navigate(HOME_URL)} title="Home">{'\u2302'}</NavBtn>
        <form onSubmit={(e) => { e.preventDefault(); navigate(urlBar); }} style={{ flex: 1, display: 'flex' }}>
          <input
            value={urlBar}
            onChange={e => setUrlBar(e.target.value)}
            placeholder="Enter URL or search..."
            style={{
              ...GLASS.inset,
              flex: 1, padding: '6px 12px',
              fontSize: 13, fontFamily: 'var(--font-mono)',
            }}
          />
        </form>
        {(() => {
          const isBookmarked = bookmarks.some(b => b.url === currentUrl);
          return (
            <button
              onClick={() => {
                if (isBookmarked) {
                  setBookmarks(prev => prev.filter(b => b.url !== currentUrl));
                } else {
                  setBookmarks(prev => [...prev, { url: currentUrl, title: currentUrl }]);
                }
              }}
              style={{...GLASS.ghostBtn, padding: '4px 6px', color: isBookmarked ? '#f59e0b' : 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          );
        })()}
      </div>

      {/* Bookmarks bar */}
      {bookmarks.length > 0 && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: `1px solid ${GLASS.dividerColor}`, flexWrap: 'wrap', flexShrink: 0 }}>
          {bookmarks.map((b, i) => {
            let label = b.url;
            try { label = new URL(b.url).hostname.replace('www.', ''); } catch {}
            return (
              <button key={i} onClick={() => navigate(b.url)} style={{...GLASS.ghostBtn, padding: '2px 8px', fontSize: 11}}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading bar */}
      {loading && (
        <div style={{
          height: 2, background: 'var(--accent-primary)',
          width: `${loadProgress}%`, transition: 'width 0.3s ease', flexShrink: 0,
        }} />
      )}

      {/* Content area */}
      {blocked ? (
        /* Blocked site — show info card with open-external option */
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 32,
        }}>
          <div style={{
            ...GLASS.surface,
            width: 64, height: 64, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>
            🌐
          </div>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
              {domain}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This site doesn't allow embedding. Open it in your system browser instead.
            </div>
          </div>
          <button
            onClick={openExternal}
            style={{
              ...GLASS.accentBtn,
              padding: '10px 24px', borderRadius: 10,
              fontSize: 14,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Open in Browser
          </button>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <button
              onClick={askLunaAboutPage}
              style={{
                ...GLASS.ghostBtn,
                padding: '6px 14px', color: 'var(--accent-primary)',
                border: `1px solid ${GLASS.selectedBorder}`, fontSize: 12,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(126, 184, 255, 0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Ask Luna about this page
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* AI summary banner */}
          <div
            onClick={askLunaAboutPage}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              background: 'rgba(126, 184, 255, 0.06)',
              borderBottom: `1px solid ${GLASS.dividerColor}`,
              cursor: 'pointer', fontSize: 12, color: 'var(--accent-primary)',
              flexShrink: 0, transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(126, 184, 255, 0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(126, 184, 255, 0.06)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Ask Luna about this page
          </div>

          {/* Iframe content */}
          <iframe
            ref={iframeRef}
            key={currentUrl}
            src={currentUrl}
            style={{ flex: 1, border: 'none', background: '#fff' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Browser content"
            onLoad={() => { setLoading(false); setLoadProgress(100); }}
            onError={() => setLoading(false)}
          />
        </>
      )}
    </div>
  );
}

function NavBtn({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...GLASS.ghostBtn,
        borderRadius: 6, color: disabled ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)',
        width: 30, height: 30, cursor: disabled ? 'default' : 'pointer',
        fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-ui)', flexShrink: 0, padding: 0,
      }}
    >
      {children}
    </button>
  );
}

export default BrowserApp;
