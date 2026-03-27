interface TerminalViewProps {
  content: string;
}

/** Terminal-style view with dark background and monospace font. */
export function TerminalView({ content }: TerminalViewProps) {
  return (
    <div
      style={{
        background: '#0d0d0d',
        color: '#00ff41',
        fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace)',
        fontSize: '13px',
        lineHeight: '1.5',
        padding: '12px 16px',
        height: '100%',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content ? (
        content.split('\n').map((line, i) => (
          <div key={i}>
            <span style={{ color: '#666', marginRight: 8, userSelect: 'none' }}>$</span>
            {line}
          </div>
        ))
      ) : (
        <div style={{ color: '#555' }}>Terminal ready.</div>
      )}
    </div>
  );
}
