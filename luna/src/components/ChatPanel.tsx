import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentStore, type ChatMessage } from '../stores/agentStore';
import { ActionCard } from './ActionCard';

/** Format timestamp to readable time */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Copy button for code blocks */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: 'none',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: copied ? 'var(--color-accent, #d4a574)' : 'var(--text-tertiary, #6a6058)',
        cursor: 'pointer',
        fontSize: '11px',
        padding: '2px 8px',
        fontFamily: 'var(--font-system)',
        transition: 'color 0.15s',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/** Markdown components for ReactMarkdown */
const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const isInline = !match && !codeString.includes('\n');

    if (isInline) {
      return (
        <code
          style={{
            background: 'rgba(0,0,0,0.25)',
            padding: '1px 6px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.88em',
          }}
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div style={{
        borderRadius: 8,
        overflow: 'hidden',
        margin: '8px 0',
        border: '1px solid var(--border-subtle, #3a332e)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 12px',
          background: 'rgba(0,0,0,0.3)',
          fontSize: '11px',
          color: 'var(--text-tertiary, #6a6058)',
        }}>
          <span>{match ? match[1] : 'code'}</span>
          <CopyButton text={codeString} />
        </div>
        <pre style={{
          margin: 0,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.2)',
          overflowX: 'auto',
          fontSize: '12.5px',
          lineHeight: '1.5',
        }}>
          <code
            className={className}
            style={{ fontFamily: 'var(--font-mono, monospace)' }}
            {...props}
          >
            {children}
          </code>
        </pre>
      </div>
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table({ children }: any) {
    return (
      <div style={{ overflowX: 'auto', margin: '8px 0' }}>
        <table className="chat-table">{children}</table>
      </div>
    );
  },
};

/** User message bubble */
function UserMessage({ msg, isGrouped }: { msg: ChatMessage; isGrouped: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginTop: isGrouped ? 2 : 12,
        padding: '0 16px',
        animation: 'fadeSlideIn 0.2s ease-out',
      }}
    >
      {!isGrouped && (
        <span style={{
          fontSize: '10px',
          color: 'var(--text-tertiary, #6a6058)',
          marginBottom: 4,
          paddingRight: 4,
        }}>
          You · {formatTime(msg.timestamp)}
        </span>
      )}
      <div style={{
        maxWidth: '70%',
        padding: '8px 14px',
        borderRadius: '16px 16px 4px 16px',
        background: 'var(--color-accent, #d4a574)',
        color: 'var(--surface-base, #1a1614)',
        fontFamily: 'var(--font-system)',
        fontSize: '13px',
        lineHeight: '1.55',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.text}
      </div>
    </div>
  );
}

/** Assistant message — full-width with left accent border */
function AssistantMessage({ msg, isGrouped }: { msg: ChatMessage; isGrouped: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginTop: isGrouped ? 2 : 14,
        padding: '0 16px',
        animation: 'fadeSlideIn 0.2s ease-out',
      }}
    >
      {!isGrouped && (
        <span style={{
          fontSize: '10px',
          color: 'var(--text-tertiary, #6a6058)',
          marginBottom: 4,
          paddingLeft: 14,
        }}>
          Luna · {formatTime(msg.timestamp)}
        </span>
      )}
      <div
        className="chat-assistant-msg"
        style={{
          width: '100%',
          padding: '10px 14px',
          borderLeft: '3px solid var(--color-accent, #d4a574)',
          color: 'var(--text-primary, #e8e0d8)',
          fontFamily: 'var(--font-system)',
          fontSize: '13px',
          lineHeight: '1.6',
          wordBreak: 'break-word',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {msg.text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Typing indicator with animated dots */
function TypingIndicator() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px 10px 30px',
      marginTop: 8,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-accent, #d4a574)',
              animation: `typingDot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
      <span style={{
        fontSize: '12px',
        color: 'var(--text-tertiary, #6a6058)',
        fontStyle: 'italic',
      }}>
        Thinking...
      </span>
    </div>
  );
}

/** Inline streaming message with blinking cursor */
function StreamingMessageInline({ text, elapsedMs }: { text: string; elapsedMs: number }) {
  const elapsed = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="streaming-message" style={{ borderLeft: '3px solid var(--color-accent, #d4a574)', paddingLeft: 12 }}>
      <div className="chat-assistant-msg" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary, #e8e0d8)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
        <span className="luna-streaming-cursor">▎</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary, #6a6058)', marginTop: 4 }}>
        Streaming · {timeStr}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const chatMessages = useAgentStore((s) => s.chatMessages);
  const status = useAgentStore((s) => s.status);
  const streamingTokens = useAgentStore((s) => s.streamingTokens);
  const streamingStartTime = useAgentStore((s) => s.streamingStartTime);
  const activeSubAgents = useAgentStore((s) => s.activeSubAgents);
  const streamingActions = useAgentStore((s) => s.streamingActions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Update elapsed time for streaming
  useEffect(() => {
    if (status !== 'streaming') return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, status, streamingTokens, streamingActions.length]);

  const isGrouped = (idx: number): boolean => {
    if (idx === 0) return false;
    return chatMessages[idx].role === chatMessages[idx - 1].role;
  };

  return (
    <div className="chat-panel">
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-assistant-msg p { margin: 0 0 6px 0; }
        .chat-assistant-msg p:last-child { margin-bottom: 0; }
        .chat-assistant-msg ul, .chat-assistant-msg ol { margin: 4px 0; padding-left: 20px; }
        .chat-assistant-msg li { margin: 2px 0; }
        .chat-assistant-msg strong { font-weight: 600; }
        .chat-assistant-msg em { font-style: italic; }
        .chat-assistant-msg h1, .chat-assistant-msg h2, .chat-assistant-msg h3 {
          margin: 10px 0 4px;
          font-weight: 600;
        }
        .chat-assistant-msg h1 { font-size: 16px; }
        .chat-assistant-msg h2 { font-size: 15px; }
        .chat-assistant-msg h3 { font-size: 14px; }
        .chat-assistant-msg blockquote {
          border-left: 3px solid var(--color-accent, #d4a574);
          padding-left: 10px;
          margin: 6px 0;
          color: var(--text-secondary, #b0a898);
        }
        .chat-assistant-msg a {
          color: var(--color-accent, #d4a574);
          text-decoration: underline;
        }
        .chat-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .chat-table th, .chat-table td {
          padding: 5px 10px;
          border-bottom: 1px solid var(--border-subtle, #3a332e);
          text-align: left;
        }
        .chat-table th {
          background: rgba(0,0,0,0.2);
          font-weight: 600;
        }
        .chat-table tr:nth-child(even) {
          background: rgba(0,0,0,0.08);
        }
      `}</style>

      {/* Messages */}
      <div ref={scrollRef} className="chat-panel__messages">
        {chatMessages.length === 0 && status !== 'streaming' && (
          <div className="chat-panel__empty">
            Send a message to start a conversation with Luna.
          </div>
        )}

        {chatMessages.map((msg, idx) => (
          <div key={msg.id}>
            {msg.role === 'user'
              ? <UserMessage msg={msg} isGrouped={isGrouped(idx)} />
              : (
                <>
                  <AssistantMessage msg={msg} isGrouped={isGrouped(idx)} />
                  {/* Inline action cards for completed messages */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="chat-panel__actions">
                      {msg.actions.map((action) => (
                        <ActionCard
                          key={action.id}
                          event={{ ...action, payload: {} } as any}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </>
              )
            }
          </div>
        ))}

        {/* Streaming state */}
        {status === 'streaming' && (
          streamingTokens ? (
            <div style={{ padding: '10px 12px', marginTop: 8, animation: 'fadeSlideIn 0.2s ease-out' }}>
              <StreamingMessageInline text={streamingTokens} elapsedMs={streamingStartTime ? now - streamingStartTime : 0} />

              {/* Live action cards during streaming */}
              {streamingActions.length > 0 && (
                <div className="chat-panel__actions">
                  {streamingActions.slice(-5).map((action) => (
                    <ActionCard
                      key={action.id}
                      event={{ ...action, payload: {} } as any}
                      compact
                    />
                  ))}
                </div>
              )}

              {activeSubAgents.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary, #6a6058)' }}>
                  {activeSubAgents.map((a) => (
                    <div key={a.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-amber-500, #d4a574)' }}>◎</span>
                      <span>{a.task} ({a.status})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <TypingIndicator />
          )
        )}
      </div>
    </div>
  );
}
