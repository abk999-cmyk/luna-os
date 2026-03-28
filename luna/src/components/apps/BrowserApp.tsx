import React, { useState, useCallback, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { sendMessageStreaming } from '../../ipc/agent';

interface BrowserProps {
  url?: string;
}

const HOME_URL = 'https://www.google.com';

export function BrowserApp({ url: urlProp }: BrowserProps) {
  const [currentUrl, setCurrentUrl] = useState(urlProp || HOME_URL);
  const [urlBar, setUrlBar] = useState(urlProp || HOME_URL);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const simulateLoad = useCallback(() => {
    setLoading(true);
    setLoadProgress(0);
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
    simulateLoad();
  }, [currentUrl, simulateLoad]);

  const goBack = useCallback(() => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setForwardStack(f => [...f, currentUrl]);
    setHistoryStack(h => h.slice(0, -1));
    setCurrentUrl(prev);
    setUrlBar(prev);
    simulateLoad();
  }, [historyStack, currentUrl, simulateLoad]);

  const goForward = useCallback(() => {
    if (forwardStack.length === 0) return;
    const next = forwardStack[forwardStack.length - 1];
    setHistoryStack(h => [...h, currentUrl]);
    setForwardStack(f => f.slice(0, -1));
    setCurrentUrl(next);
    setUrlBar(next);
    simulateLoad();
  }, [forwardStack, currentUrl, simulateLoad]);

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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--surface-base, #1a1614)', color: 'var(--text-primary, #e8e0d8)',
      fontFamily: 'var(--font-primary, system-ui)', fontSize: 13,
      overflow: 'hidden',
    }}>
      {/* Navigation bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
        borderBottom: '1px solid var(--glass-edge-light, rgba(255,255,255,0.12))',
        background: 'var(--glass-bg, rgba(255,255,255,0.08))',
        flexShrink: 0,
      }}>
        <NavBtn onClick={goBack} disabled={historyStack.length === 0} title="Back">{'\u2190'}</NavBtn>
        <NavBtn onClick={goForward} disabled={forwardStack.length === 0} title="Forward">{'\u2192'}</NavBtn>
        <NavBtn onClick={() => simulateLoad()} title="Refresh">{loading ? '\u25a0' : '\u21bb'}</NavBtn>
        <NavBtn onClick={() => navigate(HOME_URL)} title="Home">{'\u2302'}</NavBtn>
        <form onSubmit={(e) => { e.preventDefault(); navigate(urlBar); }} style={{ flex: 1, display: 'flex' }}>
          <input
            value={urlBar}
            onChange={e => setUrlBar(e.target.value)}
            placeholder="Enter URL or search..."
            style={{
              flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-edge-light, rgba(255,255,255,0.12))',
              borderRadius: 8, padding: '6px 12px', color: 'var(--text-primary, #e8e0d8)',
              fontSize: 13, fontFamily: 'var(--font-mono, monospace)', outline: 'none',
            }}
          />
        </form>
      </div>

      {/* Loading bar */}
      {loading && (
        <div style={{
          height: 2, background: 'var(--accent-primary, #7eb8ff)',
          width: `${loadProgress}%`, transition: 'width 0.3s ease', flexShrink: 0,
        }} />
      )}

      {/* AI summary banner */}
      <div
        onClick={askLunaAboutPage}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          background: 'rgba(126, 184, 255, 0.06)',
          borderBottom: '1px solid rgba(126, 184, 255, 0.1)',
          cursor: 'pointer', fontSize: 12, color: 'var(--accent-primary, #7eb8ff)',
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

      {/* Content */}
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
        background: 'none', border: '1px solid var(--glass-edge-light, rgba(255,255,255,0.12))',
        borderRadius: 6, color: disabled ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary, #b0a898)',
        width: 30, height: 30, cursor: disabled ? 'default' : 'pointer',
        fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-primary, system-ui)', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export default BrowserApp;
