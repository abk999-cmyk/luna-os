import { useRef, useEffect, useState } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/code-editor.css';

/** Simple code editor with syntax highlighting via <textarea>.
 *  For production, replace with CodeMirror 6 integration. */
export function CodeEditor({ id, props, onEvent }: PrimitiveProps) {
  const [value, setValue] = useState(props.value || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (props.value !== undefined && props.value !== value) {
      setValue(props.value);
    }
  }, [props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    onEvent('onChange', { value: v });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab inserts 2 spaces instead of moving focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = value.substring(0, start) + '  ' + value.substring(end);
      setValue(newVal);
      onEvent('onChange', { value: newVal });
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    // Cmd/Ctrl+Enter = run
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onEvent('onRun', { value });
    }
  };

  return (
    <div className="luna-code-editor" id={id}>
      <div className="luna-code-editor__header">
        <span className="luna-code-editor__language">{props.language || 'text'}</span>
        {props.showRunButton && (
          <button
            className="luna-code-editor__run"
            onClick={() => onEvent('onRun', { value })}
          >
            Run
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        className="luna-code-editor__textarea"
        value={value}
        readOnly={props.readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={props.rows || 15}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {props.lineNumbers !== false && (
        <div className="luna-code-editor__line-numbers">
          {value.split('\n').map((_: string, i: number) => (
            <div key={i} className="luna-code-editor__line-number">{i + 1}</div>
          ))}
        </div>
      )}
    </div>
  );
}
