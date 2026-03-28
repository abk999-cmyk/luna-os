import { useCallback, useRef } from 'react';
import { useShellStore, type ContextItem } from '../stores/shellStore';
import { ContextChip } from './ContextChip';

export function ContextTray() {
  const items = useShellStore((s) => s.contextTrayItems);
  const addContextItem = useShellStore((s) => s.addContextItem);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const content = await readFileContent(file);
      const item: ContextItem = {
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        type: getFileCategory(file.name),
        size: file.size,
        content,
        preview: content.slice(0, 500),
      };
      addContextItem(item);
    }
    // Reset so the same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addContextItem]);

  if (items.length === 0) return null;

  return (
    <div className="context-tray">
      {items.map((item) => (
        <ContextChip key={item.id} item={item} />
      ))}
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Add file"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          border: '1px dashed var(--border-subtle)',
          borderRadius: '50%',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        +
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
}

async function readFileContent(file: File): Promise<string> {
  const MAX_SIZE = 100 * 1024; // 100KB
  if (file.size > MAX_SIZE) {
    return `[File too large: ${(file.size / 1024).toFixed(0)}KB. Only metadata attached.]`;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(`[Failed to read: ${file.name}]`);
    reader.readAsText(file);
  });
}

function getFileCategory(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'sh'];
  const docExts = ['md', 'txt', 'doc', 'docx', 'pdf', 'rtf', 'csv'];
  if (codeExts.includes(ext)) return 'code';
  if (docExts.includes(ext)) return 'doc';
  return 'other';
}
