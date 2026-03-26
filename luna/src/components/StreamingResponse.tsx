import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface StreamingResponseProps {
  /** Once streaming is done, this contains the final text. */
  finalText?: string;
}

/** Renders LLM response tokens as they stream in, with a blinking cursor. */
export function StreamingResponse({ finalText }: StreamingResponseProps) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (finalText !== undefined) {
      setText(finalText);
      setStreaming(false);
      return;
    }

    const unlistenToken = listen<{ token: string }>('agent-stream-token', (event) => {
      setText((prev) => prev + (event.payload.token || ''));
      // Auto-scroll
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });

    const unlistenDone = listen('agent-stream-done', () => {
      setStreaming(false);
    });

    return () => {
      unlistenToken.then((fn) => fn());
      unlistenDone.then((fn) => fn());
    };
  }, [finalText]);

  return (
    <div
      ref={containerRef}
      className="luna-streaming-response"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.95rem',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: '12px 16px',
        overflow: 'auto',
        height: '100%',
        color: 'var(--color-text)',
      }}
    >
      {text}
      {streaming && <span className="luna-streaming-cursor">▎</span>}
    </div>
  );
}
