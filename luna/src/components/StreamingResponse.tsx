import { useRef, useEffect } from 'react';

interface StreamingResponseProps {
  /** The current text content (accumulated tokens or final text). */
  text: string;
  /** Whether the response is still streaming. */
  streaming: boolean;
}

/** Renders LLM response tokens as they stream in, with a blinking cursor.
 *  H16: Accepts text and streaming as props instead of duplicating App.tsx event listeners. */
export function StreamingResponse({ text, streaming }: StreamingResponseProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as content grows
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

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
