import { useAmbientVoice } from '../hooks/useAmbientVoice';
import { sendMessageStreaming } from '../ipc/agent';
import { useAgentStore } from '../stores/agentStore';

/** Floating ambient voice badge — shows live transcript, tap to submit. */
export function AmbientBadge() {
  const { isAmbientActive, toggleAmbient, ambientState, currentTranscript, dismissTranscript, submitTranscript } =
    useAmbientVoice();
  const setStatus = useAgentStore((s) => s.setStatus);

  const handleSubmit = async () => {
    const text = submitTranscript();
    if (text.trim()) {
      setStatus('streaming');
      try {
        await sendMessageStreaming(text);
        setStatus('idle');
      } catch {
        setStatus('error');
      }
    }
  };

  return (
    <>
      {/* Ambient toggle button — always visible in bottom-right area */}
      <button
        className="ambient-toggle"
        onClick={toggleAmbient}
        title={isAmbientActive ? 'Stop ambient listening' : 'Start ambient listening'}
        style={{
          position: 'fixed',
          bottom: 60,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          background: isAmbientActive ? 'var(--color-accent, #d4a574)' : 'var(--color-surface-raised, #3a3633)',
          color: isAmbientActive ? 'white' : 'var(--color-text-muted)',
          cursor: 'pointer',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isAmbientActive ? '0 0 8px var(--color-accent, #d4a574)' : 'none',
          transition: 'all 0.2s ease',
          zIndex: 1000,
        }}
      >
        {isAmbientActive ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12 L5 12 L8 4 L12 20 L16 8 L18 12 L22 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Transcript badge — shown when speech detected */}
      {ambientState === 'speech_detected' && currentTranscript && (
        <div
          className="ambient-badge"
          style={{
            position: 'fixed',
            bottom: 104,
            right: 16,
            maxWidth: 360,
            padding: '10px 14px',
            background: 'var(--color-surface-raised, #3a3633)',
            border: '1px solid var(--color-border, #4a4744)',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1001,
            animation: 'slide-up 0.2s ease',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', marginBottom: 8, lineHeight: 1.4 }}>
            {currentTranscript}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={dismissTranscript}
              style={{
                padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--color-border)',
                borderRadius: 6, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={handleSubmit}
              style={{
                padding: '4px 10px', fontSize: '0.75rem', border: 'none',
                borderRadius: 6, background: 'var(--color-accent, #d4a574)', color: 'white', cursor: 'pointer',
              }}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </>
  );
}
