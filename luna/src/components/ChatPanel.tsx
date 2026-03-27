import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentStore, type ChatMessage } from '../stores/agentStore';

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

export function ChatPanel() {
  const chatMessages = useAgentStore((s) => s.chatMessages);
  const status = useAgentStore((s) => s.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, status]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (chatMessages.length === 0 && status !== 'streaming') return null;

  const isGrouped = (idx: number): boolean => {
    if (idx === 0) return false;
    return chatMessages[idx].role === chatMessages[idx - 1].role;
  };

  return (
    <>
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

      <div
        style={{
          position: 'fixed',
          bottom: 56,
          left: 0,
          right: 0,
          maxHeight: isExpanded ? '45vh' : 40,
          background: 'rgba(26, 22, 20, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          zIndex: 900,
          display: 'flex',
          flexDirection: 'column',
          transition: 'max-height 0.25s ease-in-out',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          onClick={toggleExpanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            cursor: 'pointer',
            borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
            flexShrink: 0,
          }}
        >
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary, #b0a898)',
            fontFamily: 'var(--font-system)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Chat · {chatMessages.length}
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-tertiary, #6a6058)',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▲
          </span>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingTop: 4,
            paddingBottom: 10,
          }}
        >
          {chatMessages.map((msg, idx) => (
            msg.role === 'user'
              ? <UserMessage key={msg.id} msg={msg} isGrouped={isGrouped(idx)} />
              : <AssistantMessage key={msg.id} msg={msg} isGrouped={isGrouped(idx)} />
          ))}
          {status === 'streaming' && <TypingIndicator />}
        </div>
      </div>
    </>
  );
}
