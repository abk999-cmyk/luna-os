interface ResponseDisplayProps {
  text: string;
}

export function ResponseDisplay({ text }: ResponseDisplayProps) {
  return (
    <div className="response-display" style={{
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-base)',
      lineHeight: 'var(--leading-relaxed)',
      color: 'var(--text-primary)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {text}
    </div>
  );
}
