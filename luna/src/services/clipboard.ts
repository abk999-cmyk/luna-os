// OS-level clipboard that works alongside browser clipboard
// Stores the last copied content with type info for cross-app paste

interface ClipboardEntry {
  type: 'text' | 'cells' | 'json' | 'html';
  data: any;
  source: string; // app/window that copied
  timestamp: number;
}

let currentClip: ClipboardEntry | null = null;
const clipListeners: Set<() => void> = new Set();

export function lunaClipCopy(type: ClipboardEntry['type'], data: any, source: string) {
  currentClip = { type, data, source, timestamp: Date.now() };
  // Also copy plain text to system clipboard
  const text = type === 'text' ? data : JSON.stringify(data);
  navigator.clipboard.writeText(text).catch(() => {});
  clipListeners.forEach(fn => fn());
}

export function lunaClipPaste(): ClipboardEntry | null {
  return currentClip;
}

export function lunaClipHas(): boolean {
  return currentClip !== null;
}

export function onClipChange(fn: () => void): () => void {
  clipListeners.add(fn);
  return () => { clipListeners.delete(fn); };
}
