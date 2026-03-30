interface ScratchpadViewProps {
  content: string;
  onChange: (text: string) => void;
}

/** Simple plain-text textarea for quick notes (no rich formatting). */
export function ScratchpadView({ content, onChange }: ScratchpadViewProps) {
  return (
    <textarea
      value={content}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Start typing..."
      style={{
        width: '100%',
        height: '100%',
        padding: '12px 16px',
        background: 'transparent',
        color: 'var(--text-primary)',
        border: 'none',
        outline: 'none',
        resize: 'none',
        fontFamily: 'var(--font-system)',
        fontSize: 'var(--text-base)',
        lineHeight: '1.6',
      }}
    />
  );
}
