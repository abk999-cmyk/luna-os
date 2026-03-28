import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  elapsedMs: number;
}

export function StreamingMessage({ text, elapsedMs }: Props) {
  const elapsed = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="streaming-message">
      {text ? (
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          <span className="streaming-message__cursor" />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Thinking</span>
          <span className="streaming-message__cursor" />
        </div>
      )}
      <div className="streaming-message__meta">
        Streaming · {timeStr}
      </div>
    </div>
  );
}
