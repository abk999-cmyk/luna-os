import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface Command {
  id: string;
  label: string;
  category: 'action' | 'window' | 'workspace' | 'template' | 'memory';
  shortcut?: string;
  action: () => void;
}

// ── Global command registry ──────────────────────────────────────────────────

let registeredCommands: Command[] = [];
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function registerCommand(command: Command): () => void {
  registeredCommands = [...registeredCommands, command];
  notify();
  return () => {
    registeredCommands = registeredCommands.filter((c) => c.id !== command.id);
    notify();
  };
}

export function registerCommands(commands: Command[]): () => void {
  registeredCommands = [...registeredCommands, ...commands];
  notify();
  return () => {
    const ids = new Set(commands.map((c) => c.id));
    registeredCommands = registeredCommands.filter((c) => !ids.has(c.id));
    notify();
  };
}

function useRegisteredCommands(): Command[] {
  const [commands, setCommands] = useState<Command[]>(registeredCommands);

  useEffect(() => {
    const listener = () => setCommands(registeredCommands);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return commands;
}

// ── Category labels ──────────────────────────────────────────────────────────

const categoryLabels: Record<Command['category'], string> = {
  action: 'Actions',
  window: 'Windows',
  workspace: 'Workspaces',
  template: 'Templates',
  memory: 'Memory',
};

const categoryOrder: Command['category'][] = ['action', 'window', 'workspace', 'template', 'memory'];

// ── Highlight matching text ──────────────────────────────────────────────────

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

let togglePalette: (() => void) | null = null;

export function getTogglePalette(): () => void {
  return () => togglePalette?.();
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useRegisteredCommands();

  // Expose toggle for external use
  useEffect(() => {
    togglePalette = () => setIsOpen((prev) => !prev);
    return () => { togglePalette = null; };
  }, []);

  // Global keyboard listener: Cmd+Shift+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && e.metaKey && e.shiftKey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay for the DOM to render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Filter commands
  const filtered = useMemo(() => {
    if (!query) return commands;
    const lq = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lq) ||
        cmd.category.toLowerCase().includes(lq)
    );
  }, [commands, query]);

  // Group by category, preserving order
  const grouped = useMemo(() => {
    const map = new Map<Command['category'], Command[]>();
    for (const cmd of filtered) {
      const existing = map.get(cmd.category) || [];
      existing.push(cmd);
      map.set(cmd.category, existing);
    }
    // Return in canonical order
    const result: { category: Command['category']; commands: Command[] }[] = [];
    for (const cat of categoryOrder) {
      const cmds = map.get(cat);
      if (cmds && cmds.length > 0) {
        result.push({ category: cat, commands: cmds });
      }
    }
    return result;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => grouped.flatMap((g) => g.commands), [grouped]);

  // Clamp selectedIndex when list changes
  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIndex]);

  const executeSelected = useCallback(() => {
    const cmd = flatList[selectedIndex];
    if (cmd) {
      setIsOpen(false);
      cmd.action();
    }
  }, [flatList, selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatList.length));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + flatList.length) % Math.max(1, flatList.length));
          break;
        case 'Enter':
          e.preventDefault();
          executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [flatList.length, executeSelected]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div style={styles.overlay} onClick={() => setIsOpen(false)}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command..."
            style={styles.input}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={styles.list}>
          {grouped.length === 0 && (
            <div style={styles.empty}>No matching commands</div>
          )}
          {grouped.map((group) => (
            <div key={group.category}>
              <div style={styles.categoryHeader}>
                {categoryLabels[group.category]}
              </div>
              {group.commands.map((cmd) => {
                const idx = flatIndex++;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    data-selected={isSelected}
                    style={{
                      ...styles.item,
                      ...(isSelected ? styles.itemSelected : {}),
                    }}
                    onClick={() => {
                      setIsOpen(false);
                      cmd.action();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span style={styles.itemLabel}>
                      <HighlightMatch text={cmd.label} query={query} />
                    </span>
                    {cmd.shortcut && (
                      <kbd style={styles.shortcut}>{cmd.shortcut}</kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Styles (using CSS variables from theme.css) ──────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '15vh',
    zIndex: 'var(--z-overlay)' as any,
    animation: 'commandPaletteFadeIn var(--duration-fast) var(--ease-smooth)',
  },
  modal: {
    width: '520px',
    maxWidth: '90vw',
    maxHeight: '420px',
    backgroundColor: 'var(--surface-elevated)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'commandPaletteSlideIn var(--duration-fast) var(--ease-smooth)',
  },
  inputWrapper: {
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  input: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--text-base)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface-tertiary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-2) 0',
  },
  categoryHeader: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-4)',
    margin: '0 var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background-color var(--duration-instant) var(--ease-smooth)',
  },
  itemSelected: {
    backgroundColor: 'var(--surface-tertiary)',
  },
  itemLabel: {
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
  },
  shortcut: {
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--surface-tertiary)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
  },
  empty: {
    padding: 'var(--space-6) var(--space-4)',
    textAlign: 'center',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-tertiary)',
  },
};
