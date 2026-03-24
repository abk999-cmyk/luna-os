import { useRef, useEffect } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/code-editor.css';

/** Read-only terminal output display. */
export function Terminal({ id, props }: PrimitiveProps) {
  const lines: string[] = props.lines || [];
  const output = props.output || '';
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, output]);

  const displayLines = lines.length > 0 ? lines : output.split('\n');

  return (
    <div className="luna-terminal" id={id}>
      <div className="luna-terminal__header">
        <span className="luna-terminal__title">{props.title || 'Terminal'}</span>
      </div>
      <div className="luna-terminal__output">
        {displayLines.map((line: string, i: number) => (
          <div key={i} className="luna-terminal__line">
            {props.showPrompt !== false && <span className="luna-terminal__prompt">$</span>}
            <span>{line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
