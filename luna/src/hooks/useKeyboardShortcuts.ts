import { useEffect } from 'react';

export interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Registers global keyboard shortcuts.
 *
 * Key format: modifier+key, e.g. "meta+shift+k", "ctrl+z", "alt+n"
 * Supported modifiers: meta, ctrl, shift, alt
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.metaKey) parts.push('meta');
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');
      parts.push(e.key.toLowerCase());

      const combo = parts.join('+');

      if (shortcuts[combo]) {
        e.preventDefault();
        e.stopPropagation();
        shortcuts[combo]();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
