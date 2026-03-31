import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { useAgentStore } from '../stores/agentStore';
import { sendMessageStreaming } from '../ipc/agent';
import { GLASS } from './apps/glassStyles';

export type CommandCategory = 'action' | 'window' | 'workspace' | 'template' | 'memory' | 'notes' | 'contacts' | 'calendar' | 'files' | 'todo' | 'search';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  shortcut?: string;
  action: () => void;
  subtitle?: string;
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

// ── Category labels & order ─────────────────────────────────────────────────

const categoryLabels: Record<CommandCategory, string> = {
  action: 'Actions',
  window: 'Windows',
  workspace: 'Workspaces',
  template: 'Templates',
  memory: 'Memory',
  notes: 'Notes',
  contacts: 'Contacts',
  calendar: 'Calendar',
  files: 'Files',
  todo: 'Tasks',
  search: 'AI Search',
};

const categoryOrder: CommandCategory[] = [
  'action', 'window', 'workspace', 'notes', 'contacts', 'calendar', 'todo', 'files', 'template', 'memory', 'search'
];

// ── Category icons (SVG) ────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: CommandCategory }) {
  const iconStyle: React.CSSProperties = { width: 14, height: 14, opacity: 0.5, flexShrink: 0 };
  switch (category) {
    case 'notes':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case 'contacts':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'calendar':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'todo':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'files':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case 'search':
      return <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    default:
      return null;
  }
}

// ── Content search helpers ──────────────────────────────────────────────────

function contentTypeToCategory(ct: string): CommandCategory | null {
  const map: Record<string, CommandCategory> = {
    notes: 'notes',
    contacts: 'contacts',
    calendar: 'calendar',
    todo: 'todo',
    file_manager: 'files',
    editor: 'files',
    text_editor: 'files',
  };
  return map[ct] || null;
}

function searchWindowContent(
  query: string,
  windows: Array<{ id: string; title?: string; content_type?: string }>,
  windowContent: Map<string, string>,
): Command[] {
  if (!query || query.length < 2) return [];
  const lq = query.toLowerCase();
  const results: Command[] = [];

  for (const w of windows) {
    const content = windowContent.get(w.id);
    if (!content) continue;

    try {
      const data = JSON.parse(content);
      const category = contentTypeToCategory(w.content_type || '');
      if (!category && w.content_type !== 'editor' && w.content_type !== 'text_editor') {
        // Try plain text fallback
        if (content.toLowerCase().includes(lq)) {
          results.push({
            id: `search-content-${w.id}`,
            label: w.title || 'Window',
            category: 'files',
            subtitle: content.slice(0, 60),
            action: () => useWindowStore.getState().focusWindow(w.id),
          });
        }
        continue;
      }

      // Notes
      if (w.content_type === 'notes' && data.notes) {
        for (const note of data.notes) {
          if (
            (note.title || '').toLowerCase().includes(lq) ||
            (note.content || '').toLowerCase().includes(lq)
          ) {
            results.push({
              id: `search-note-${note.id}`,
              label: note.title || 'Untitled Note',
              category: 'notes',
              subtitle: (note.content || '').slice(0, 60),
              action: () => useWindowStore.getState().focusWindow(w.id),
            });
          }
        }
      }

      // Contacts
      if (w.content_type === 'contacts' && data.contacts) {
        for (const c of data.contacts) {
          const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
          if (
            name.toLowerCase().includes(lq) ||
            (c.email || '').toLowerCase().includes(lq)
          ) {
            results.push({
              id: `search-contact-${c.id}`,
              label: name || 'Unknown',
              category: 'contacts',
              subtitle: c.email || c.phone || '',
              action: () => useWindowStore.getState().focusWindow(w.id),
            });
          }
        }
      }

      // Calendar
      if (w.content_type === 'calendar' && data.events) {
        for (const ev of data.events) {
          if ((ev.title || '').toLowerCase().includes(lq)) {
            results.push({
              id: `search-event-${ev.id}`,
              label: ev.title,
              category: 'calendar',
              subtitle: ev.start ? new Date(ev.start).toLocaleDateString() : '',
              action: () => useWindowStore.getState().focusWindow(w.id),
            });
          }
        }
      }

      // Todo
      if (w.content_type === 'todo' && data.lists) {
        for (const list of data.lists) {
          for (const item of list.items || []) {
            if ((item.title || item.text || '').toLowerCase().includes(lq)) {
              results.push({
                id: `search-todo-${item.id || Math.random()}`,
                label: item.title || item.text || 'Untitled',
                category: 'todo',
                subtitle: `${list.name || 'List'} \u00b7 ${item.done ? 'Done' : 'Pending'}`,
                action: () => useWindowStore.getState().focusWindow(w.id),
              });
            }
          }
        }
      }

      // Editor / text files
      if (
        (w.content_type === 'editor' || w.content_type === 'text_editor') &&
        typeof content === 'string' &&
        content.toLowerCase().includes(lq)
      ) {
        results.push({
          id: `search-file-${w.id}`,
          label: w.title || 'Document',
          category: 'files',
          subtitle: content.slice(0, 60),
          action: () => useWindowStore.getState().focusWindow(w.id),
        });
      }
    } catch {
      // Plain text fallback
      if (content.toLowerCase().includes(lq)) {
        results.push({
          id: `search-content-${w.id}`,
          label: w.title || 'Window',
          category: 'files',
          subtitle: content.slice(0, 60),
          action: () => useWindowStore.getState().focusWindow(w.id),
        });
      }
    }
  }

  return results;
}

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
      <span style={{ color: GLASS.accentColor, fontWeight: 600 }}>
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

  // Pull window data from store for content search
  const windows = useWindowStore((s) => s.windows);
  const windowContent = useWindowStore((s) => s.windowContent);

  // Expose toggle for external use
  useEffect(() => {
    togglePalette = () => setIsOpen((prev) => !prev);
    return () => { togglePalette = null; };
  }, []);

  // Global keyboard listener: Cmd+K and Cmd+Shift+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && e.metaKey) {
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
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Filter commands + search window content + AI fallback
  const filtered = useMemo(() => {
    // Start with registered commands
    let results: Command[];
    if (!query) {
      results = [...commands];
    } else {
      const lq = query.toLowerCase();
      results = commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(lq) ||
          cmd.category.toLowerCase().includes(lq),
      );
    }

    // Search window content
    const cleanQuery = query.startsWith('?') ? query.slice(1).trim() : query;
    const contentResults = searchWindowContent(cleanQuery, windows, windowContent);
    results = [...results, ...contentResults];

    // AI search: if query starts with "?" or no results found
    if (query.startsWith('?') || (query.length > 2 && results.length === 0)) {
      const aiQuery = query.startsWith('?') ? query.slice(1).trim() : query;
      if (aiQuery) {
        results.push({
          id: 'ai-search',
          label: `Ask Luna: "${aiQuery}"`,
          category: 'search' as CommandCategory,
          action: () => {
            useAgentStore.getState().addChatMessage('user', aiQuery);
            useAgentStore.getState().setStatus('streaming');
            sendMessageStreaming(aiQuery).catch(console.error);
          },
        });
      }
    }

    return results;
  }, [commands, query, windows, windowContent]);

  // Group by category, preserving order
  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, Command[]>();
    for (const cmd of filtered) {
      const existing = map.get(cmd.category) || [];
      existing.push(cmd);
      map.set(cmd.category, existing);
    }
    const result: { category: CommandCategory; commands: Command[] }[] = [];
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
    [flatList.length, executeSelected],
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
          <div style={styles.inputRow}>
            <svg
              style={styles.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search everything... (? for AI)"
              style={styles.input}
            />
            <kbd style={styles.shortcutHint}>esc</kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} style={styles.list}>
          {grouped.length === 0 && (
            <div style={styles.empty}>
              {query ? 'No results found' : 'Start typing to search...'}
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.category}>
              <div style={styles.categoryHeader}>
                <CategoryIcon category={group.category} />
                <span>{categoryLabels[group.category]}</span>
                <span style={styles.categoryCount}>{group.commands.length}</span>
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
                    <div style={styles.itemContent}>
                      <span style={styles.itemLabel}>
                        <HighlightMatch text={cmd.label} query={query} />
                      </span>
                      {cmd.subtitle && (
                        <span style={styles.itemSubtitle}>{cmd.subtitle}</span>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd style={styles.shortcut}>{cmd.shortcut}</kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerHint}>
            <kbd style={styles.footerKbd}>↑↓</kbd> navigate
          </span>
          <span style={styles.footerHint}>
            <kbd style={styles.footerKbd}>↵</kbd> select
          </span>
          <span style={styles.footerHint}>
            <kbd style={styles.footerKbd}>?</kbd> ask AI
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Styles (glass design) ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '12vh',
    zIndex: 10000,
  },
  modal: {
    width: '560px',
    maxWidth: '90vw',
    maxHeight: '480px',
    ...GLASS.elevated,
    borderRadius: 16,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  inputWrapper: {
    padding: '12px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  searchIcon: {
    width: 18,
    height: 18,
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '6px 0',
    fontSize: 15,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
  },
  shortcutHint: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-tertiary)',
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 0',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px 4px',
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  categoryCount: {
    marginLeft: 'auto',
    fontSize: 10,
    opacity: 0.4,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    margin: '0 8px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  itemSelected: {
    backgroundColor: GLASS.selectedBg,
    boxShadow: `inset 0 0 0 1px ${GLASS.selectedBorder}`,
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
  },
  itemSubtitle: {
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  shortcut: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-tertiary)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    marginLeft: 8,
  },
  empty: {
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-tertiary)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    borderTop: `1px solid ${GLASS.dividerColor}`,
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontFamily: 'var(--font-ui)',
  },
  footerHint: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  footerKbd: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 5px',
    borderRadius: 3,
    border: '1px solid rgba(255,255,255,0.08)',
  },
};
