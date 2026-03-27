import { useMemo } from 'react';
import { marked } from 'marked';

interface ResponseDisplayProps {
  text: string;
}

export function ResponseDisplay({ text }: ResponseDisplayProps) {
  const html = useMemo(() => {
    if (!text) return '';
    // Parse markdown to HTML for proper rendering of LLM markdown formatting
    return marked.parse(text, { async: false }) as string;
  }, [text]);

  return (
    <div
      className="response-display"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-relaxed)',
        color: 'var(--text-primary)',
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
