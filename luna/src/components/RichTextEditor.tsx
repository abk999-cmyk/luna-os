import { useCallback, useRef, useEffect, useState } from 'react';
import { marked } from 'marked';

interface RichTextEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
}

type FormatAction = 'bold' | 'italic' | 'underline' | 'strikeThrough' |
  'insertOrderedList' | 'insertUnorderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight';

interface ToolbarButton {
  command: FormatAction;
  label: string;
  title: string;
}

const TOOLBAR_GROUPS: ToolbarButton[][] = [
  [
    { command: 'bold', label: 'B', title: 'Bold (Cmd+B)' },
    { command: 'italic', label: 'I', title: 'Italic (Cmd+I)' },
    { command: 'underline', label: 'U', title: 'Underline (Cmd+U)' },
    { command: 'strikeThrough', label: 'S', title: 'Strikethrough' },
  ],
  [
    { command: 'insertUnorderedList', label: '\u2022', title: 'Bullet list' },
    { command: 'insertOrderedList', label: '1.', title: 'Numbered list' },
  ],
  [
    { command: 'justifyLeft', label: '\u2190', title: 'Align left' },
    { command: 'justifyCenter', label: '\u2194', title: 'Align center' },
    { command: 'justifyRight', label: '\u2192', title: 'Align right' },
  ],
];

/** Convert markdown to HTML, or pass through if already HTML */
function contentToHtml(content: string): string {
  if (!content) return '';
  // If it already contains HTML tags, use as-is
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return content;
  }
  // Parse markdown to HTML
  const html = marked.parse(content, { async: false }) as string;
  return html;
}

export function RichTextEditor({ initialContent, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const lastExternalContent = useRef(initialContent);
  // Track internal edits to prevent feedback loop:
  // user types → onChange → store update → re-render → useEffect would overwrite content
  const isInternalEdit = useRef(false);

  // Set content when initialContent changes (from mount or external update)
  useEffect(() => {
    if (!editorRef.current || !initialContent) return;

    // Skip if this change originated from user typing (internal edit)
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }

    if (initialContent !== lastExternalContent.current || !editorRef.current.innerHTML) {
      lastExternalContent.current = initialContent;
      editorRef.current.innerHTML = contentToHtml(initialContent);
    }
  }, [initialContent]);

  const execCommand = useCallback((command: FormatAction) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
    updateActiveFormats();
  }, []);

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
    if (document.queryCommandState('insertUnorderedList')) formats.add('insertUnorderedList');
    if (document.queryCommandState('insertOrderedList')) formats.add('insertOrderedList');
    setActiveFormats(formats);
  }, []);

  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      isInternalEdit.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setTimeout(updateActiveFormats, 0);
    }
  }, [updateActiveFormats]);

  const handleFontSize = useCallback((size: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
    editorRef.current?.focus();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle, #3a332e)',
          background: 'var(--surface-elevated, #2a2420)',
          flexShrink: 0,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', gap: 1, marginRight: gi < TOOLBAR_GROUPS.length - 1 ? 8 : 0 }}>
            {group.map((btn) => (
              <button
                key={btn.command}
                title={btn.title}
                onMouseDown={(e) => { e.preventDefault(); execCommand(btn.command); }}
                style={{
                  width: 28,
                  height: 26,
                  border: 'none',
                  borderRadius: 4,
                  background: activeFormats.has(btn.command) ? 'var(--color-accent, #d4a574)' : 'transparent',
                  color: activeFormats.has(btn.command) ? 'var(--surface-base, #1a1614)' : 'var(--text-secondary, #b0a898)',
                  cursor: 'pointer',
                  fontWeight: btn.command === 'bold' ? 700 : 400,
                  fontStyle: btn.command === 'italic' ? 'italic' : 'normal',
                  textDecoration: btn.command === 'underline' ? 'underline' : btn.command === 'strikeThrough' ? 'line-through' : 'none',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        ))}

        <select
          onChange={(e) => {
            if (e.target.value) {
              handleFontSize(e.target.value);
              e.target.value = '';
            }
          }}
          defaultValue=""
          style={{
            height: 26,
            border: '1px solid var(--border-subtle, #3a332e)',
            borderRadius: 4,
            background: 'var(--surface-base, #1a1614)',
            color: 'var(--text-secondary, #b0a898)',
            fontSize: '11px',
            padding: '0 4px',
            marginLeft: 8,
            cursor: 'pointer',
          }}
        >
          <option value="" disabled>Size</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="24px">24</option>
          <option value="32px">32</option>
        </select>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        style={{
          flex: 1,
          padding: '12px 16px',
          outline: 'none',
          color: 'var(--text-primary, #e8e0d8)',
          fontFamily: 'var(--font-prose, Georgia, serif)',
          fontSize: 'var(--text-base, 14px)',
          lineHeight: '1.7',
          overflowY: 'auto',
          minHeight: 0,
          cursor: 'text',
        }}
        data-placeholder="Start typing..."
      />

      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--text-tertiary, #6a6058);
          pointer-events: none;
        }
        [contenteditable] table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        [contenteditable] th, [contenteditable] td {
          border: 1px solid var(--border-subtle, #3a332e);
          padding: 6px 10px;
          text-align: left;
        }
        [contenteditable] th {
          background: var(--surface-elevated, #2a2420);
          font-weight: 600;
        }
        [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 {
          margin: 12px 0 6px;
          font-family: var(--font-system, system-ui);
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 24px;
          margin: 6px 0;
        }
        [contenteditable] code {
          background: var(--surface-elevated, #2a2420);
          padding: 2px 5px;
          border-radius: 3px;
          font-family: var(--font-mono, monospace);
          font-size: 0.9em;
        }
        [contenteditable] pre {
          background: var(--surface-elevated, #2a2420);
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
        }
        [contenteditable] blockquote {
          border-left: 3px solid var(--color-accent, #d4a574);
          padding-left: 12px;
          margin: 8px 0;
          color: var(--text-secondary, #b0a898);
        }
      `}</style>
    </div>
  );
}
