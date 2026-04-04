import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GLASS } from './glassStyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'high' | 'medium' | 'low' | 'none';

interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  dueDate: string; // ISO date or ''
  listId: string;
}

interface TodoList {
  id: string;
  name: string;
}

export interface TodoAppProps {
  lists?: TodoList[];
  items?: TodoItem[];
  onChange?: (data: { lists: TodoList[]; items: TodoItem[] }) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idC = 200;
function uid(): string { return `t_${++_idC}_${Date.now()}`; }

const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  none: 'transparent',
};

const PRIORITY_CYCLE: Priority[] = ['high', 'medium', 'low', 'none'];

function nextPriority(p: Priority): Priority {
  const i = PRIORITY_CYCLE.indexOf(p);
  return PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length];
}

function getDueDateStyle(dueDate?: string): React.CSSProperties | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { color: '#ef4444', fontWeight: 600 }; // overdue
  if (diff < 1) return { color: '#f59e0b', fontWeight: 500 }; // today
  return { color: 'var(--text-secondary)' }; // future
}

function formatDue(d: string): string {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `${diff}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const DEFAULT_LISTS: TodoList[] = [
  { id: 'l1', name: 'Personal' },
  { id: 'l2', name: 'Work' },
  { id: 'l3', name: 'Shopping' },
];

const DEFAULT_ITEMS: TodoItem[] = [
  { id: 't1', title: 'Review pull request #42', completed: false, priority: 'high', dueDate: '2026-03-30', listId: 'l2' },
  { id: 't2', title: 'Update project documentation', completed: false, priority: 'medium', dueDate: '2026-04-01', listId: 'l2' },
  { id: 't3', title: 'Fix login page bug', completed: true, priority: 'high', dueDate: '', listId: 'l2' },
  { id: 't4', title: 'Schedule dentist appointment', completed: false, priority: 'low', dueDate: '2026-04-05', listId: 'l1' },
  { id: 't5', title: 'Read chapter 7 of Rust book', completed: false, priority: 'none', dueDate: '', listId: 'l1' },
  { id: 't6', title: 'Morning run', completed: true, priority: 'none', dueDate: '', listId: 'l1' },
  { id: 't7', title: 'Eggs', completed: false, priority: 'none', dueDate: '', listId: 'l3' },
  { id: 't8', title: 'Olive oil', completed: false, priority: 'none', dueDate: '', listId: 'l3' },
  { id: 't9', title: 'Sourdough bread', completed: true, priority: 'none', dueDate: '', listId: 'l3' },
  { id: 't10', title: 'Coffee beans', completed: false, priority: 'medium', dueDate: '', listId: 'l3' },
  { id: 't11', title: 'Deploy staging build', completed: false, priority: 'high', dueDate: '2026-03-29', listId: 'l2' },
];

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TodoApp({ lists: initLists, items: initItems, onChange }: TodoAppProps) {
  const [lists, setLists] = useState<TodoList[]>(() => initLists || DEFAULT_LISTS);
  const [items, setItems] = useState<TodoItem[]>(() => initItems || DEFAULT_ITEMS);
  const isInitialMount = useRef(true);

  // Sync state changes back via onChange
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onChange?.({ lists, items });
  }, [lists, items, onChange]);
  const [activeListId, setActiveListId] = useState<string>(lists[0]?.id ?? '');
  const [newItemText, setNewItemText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  const [contextListId, setContextListId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);

  const listItems = useMemo(() => items.filter(i => i.listId === activeListId), [items, activeListId]);
  const pending = useMemo(() => listItems.filter(i => !i.completed), [listItems]);
  const completed = useMemo(() => listItems.filter(i => i.completed), [listItems]);

  const incompleteCount = useCallback((listId: string) => items.filter(i => i.listId === listId && !i.completed).length, [items]);

  const completionPct = useMemo(() => {
    if (listItems.length === 0) return 0;
    return Math.round((completed.length / listItems.length) * 100);
  }, [listItems, completed]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextListId) return;
    const handler = () => { setContextListId(null); setContextPos(null); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextListId]);

  // Focus rename input
  useEffect(() => { if (renamingListId && renameRef.current) renameRef.current.focus(); }, [renamingListId]);

  const addItem = useCallback(() => {
    const text = newItemText.trim();
    if (!text) return;
    setItems(prev => [...prev, { id: uid(), title: text, completed: false, priority: 'none', dueDate: '', listId: activeListId }]);
    setNewItemText('');
    inputRef.current?.focus();
  }, [newItemText, activeListId]);

  const toggleItem = useCallback((id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  }, []);

  const cyclePriority = useCallback((id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, priority: nextPriority(i.priority) } : i));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const startEditItem = useCallback((id: string, title: string) => {
    setEditingItemId(id);
    setEditingItemText(title);
  }, []);

  const commitEditItem = useCallback(() => {
    if (!editingItemId) return;
    const text = editingItemText.trim();
    if (text) {
      setItems(prev => prev.map(i => i.id === editingItemId ? { ...i, title: text } : i));
    }
    setEditingItemId(null);
    setEditingItemText('');
  }, [editingItemId, editingItemText]);

  const addList = useCallback(() => {
    const l: TodoList = { id: uid(), name: 'New List' };
    setLists(prev => [...prev, l]);
    setActiveListId(l.id);
    setRenamingListId(l.id);
    setRenameText('New List');
  }, []);

  const handleListContext = useCallback((e: React.MouseEvent, listId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextListId(listId);
    setContextPos({ x: e.clientX, y: e.clientY });
  }, []);

  const renameList = useCallback(() => {
    if (!contextListId) return;
    const list = lists.find(l => l.id === contextListId);
    setRenamingListId(contextListId);
    setRenameText(list?.name ?? '');
    setContextListId(null);
    setContextPos(null);
  }, [contextListId, lists]);

  const commitRename = useCallback(() => {
    if (!renamingListId) return;
    const text = renameText.trim();
    if (text) {
      setLists(prev => prev.map(l => l.id === renamingListId ? { ...l, name: text } : l));
    }
    setRenamingListId(null);
    setRenameText('');
  }, [renamingListId, renameText]);

  const deleteList = useCallback(() => {
    if (!contextListId) return;
    setLists(prev => prev.filter(l => l.id !== contextListId));
    setItems(prev => prev.filter(i => i.listId !== contextListId));
    if (activeListId === contextListId) {
      setActiveListId(lists.find(l => l.id !== contextListId)?.id ?? '');
    }
    setContextListId(null);
    setContextPos(null);
  }, [contextListId, activeListId, lists]);

  const reorderItems = useCallback((fromId: string, toId: string) => {
    setItems(prev => {
      const fromIdx = prev.findIndex(i => i.id === fromId);
      const toIdx = prev.findIndex(i => i.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const renderItem = (item: TodoItem) => {
    const isEditing = editingItemId === item.id;
    const isHovered = hoveredItem === item.id;
    const isDragging = dragItem === item.id;
    const isDragOver = dragOverItem === item.id;
    const due = formatDue(item.dueDate);
    const dueDateStyle = !item.completed ? getDueDateStyle(item.dueDate) : null;

    return (
      <div
        key={item.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          setDragItem(item.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverItem(item.id);
        }}
        onDragLeave={() => {
          if (dragOverItem === item.id) setDragOverItem(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragItem && dragItem !== item.id) {
            reorderItems(dragItem, item.id);
          }
          setDragItem(null);
          setDragOverItem(null);
        }}
        onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
        onMouseEnter={() => setHoveredItem(item.id)}
        onMouseLeave={() => setHoveredItem(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px',
          background: isDragOver && dragItem !== item.id ? GLASS.selectedBg : isHovered ? GLASS.hoverBg : 'transparent',
          borderRadius: 8, transition: 'background 0.1s ease',
          opacity: isDragging ? 0.5 : 1,
          cursor: isEditing ? 'default' : 'grab',
          borderTop: isDragOver && dragItem !== item.id ? `2px solid ${GLASS.accentColor}` : '2px solid transparent',
        }}
      >
        {/* Checkbox */}
        <div
          onClick={() => toggleItem(item.id)}
          style={{
            width: 18, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
            border: item.completed ? 'none' : '2px solid rgba(255,255,255,0.2)',
            background: item.completed ? 'var(--accent-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {item.completed && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        {/* Title */}
        {isEditing ? (
          <input
            autoFocus
            value={editingItemText}
            onChange={e => setEditingItemText(e.target.value)}
            onBlur={commitEditItem}
            onKeyDown={e => { if (e.key === 'Enter') commitEditItem(); if (e.key === 'Escape') { setEditingItemId(null); } }}
            style={{
              ...GLASS.inset, flex: 1, padding: '4px 8px', fontSize: 13,
              borderRadius: 6, fontFamily: 'var(--font-ui)',
            }}
          />
        ) : (
          <div
            onDoubleClick={() => startEditItem(item.id, item.title)}
            style={{
              flex: 1, fontSize: 13, cursor: 'default',
              textDecoration: item.completed ? 'line-through' : 'none',
              color: item.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
              opacity: item.completed ? 0.6 : 1,
            }}
          >
            {item.title}
            {due && dueDateStyle && (
              <span style={{
                marginLeft: 8, fontSize: 11,
                ...dueDateStyle,
              }}>{due}</span>
            )}
          </div>
        )}

        {/* Due date input */}
        <input
          type="date"
          value={item.dueDate || ''}
          onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, dueDate: e.target.value } : i))}
          style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, cursor: 'pointer', padding: 0, width: item.dueDate ? 'auto' : 20, opacity: item.dueDate ? 0.7 : 0.3 }}
          title="Set due date"
        />

        {/* Priority dot */}
        {item.priority !== 'none' && (
          <div
            onClick={() => cyclePriority(item.id)}
            title={`Priority: ${item.priority}`}
            style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
              background: PRIORITY_COLORS[item.priority],
              transition: 'background 0.15s ease',
            }}
          />
        )}
        {item.priority === 'none' && isHovered && (
          <div
            onClick={() => cyclePriority(item.id)}
            title="Set priority"
            style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
            }}
          />
        )}

        {/* Delete */}
        {isHovered && (
          <div
            onClick={() => deleteItem(item.id)}
            style={{
              cursor: 'pointer', color: 'var(--text-secondary)',
              opacity: 0.6, display: 'flex', alignItems: 'center',
            }}
          ><TrashIcon /></div>
        )}
      </div>
    );
  };

  return (
    <div style={{ ...GLASS.appRoot, flexDirection: 'row' }}>
      {/* Left sidebar */}
      <div style={{
        width: 220, minWidth: 220, display: 'flex', flexDirection: 'column',
        ...GLASS.elevated, borderRadius: 0,
        borderRight: `1px solid ${GLASS.dividerColor}`,
        borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
      }}>
        <div style={{
          padding: '12px 14px 8px', fontSize: 11, fontWeight: 600,
          color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5,
        }}>Lists</div>

        <div style={{ ...GLASS.scrollList }}>
          {lists.map(l => {
            const active = l.id === activeListId;
            const count = incompleteCount(l.id);
            const isRenaming = renamingListId === l.id;

            return (
              <div
                key={l.id}
                onClick={() => { setActiveListId(l.id); }}
                onContextMenu={e => handleListContext(e, l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', cursor: 'pointer',
                  background: active ? GLASS.selectedBg : 'transparent',
                  borderLeft: active ? `2px solid ${GLASS.accentColor}` : '2px solid transparent',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = GLASS.hoverBg; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><ListIcon /></div>
                {isRenaming ? (
                  <input
                    ref={renameRef}
                    value={renameText}
                    onChange={e => setRenameText(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenamingListId(null); } }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      ...GLASS.inset, flex: 1, padding: '2px 6px', fontSize: 13,
                      borderRadius: 4, fontFamily: 'var(--font-ui)',
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 500 : 400 }}>{l.name}</span>
                )}
                {count > 0 && !isRenaming && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 9999,
                    background: active ? 'rgba(126,184,255,0.2)' : 'rgba(255,255,255,0.08)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}>{count}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 10px', borderTop: `1px solid ${GLASS.dividerColor}` }}>
          <button onClick={addList} style={{
            ...GLASS.ghostBtn, width: '100%', padding: '6px 10px', fontSize: 12,
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
            justifyContent: 'flex-start',
          }}>
            <PlusIcon /> New List
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextListId && contextPos && (
        <div style={{
          position: 'fixed', left: contextPos.x, top: contextPos.y, zIndex: 300,
          ...GLASS.elevated, borderRadius: 8, padding: 4, minWidth: 120,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div onClick={renameList} style={{
            padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
          }}
            onMouseEnter={e => e.currentTarget.style.background = GLASS.hoverBg}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >Rename</div>
          <div onClick={deleteList} style={{
            padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 6, color: '#ef4444',
          }}
            onMouseEnter={e => e.currentTarget.style.background = GLASS.hoverBg}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >Delete</div>
        </div>
      )}

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeList ? (
          <>
            {/* Header + progress */}
            <div style={{ padding: '14px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{activeList.name}</h2>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {completionPct}% complete
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden', marginBottom: 12,
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'var(--accent-primary)',
                  width: `${completionPct}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>

              {/* Add input */}
              <div style={{
                display: 'flex', gap: 8, marginBottom: 8,
              }}>
                <input
                  ref={inputRef}
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                  placeholder="Add a new item..."
                  style={{
                    ...GLASS.inset, flex: 1, padding: '8px 12px', fontSize: 13,
                    borderRadius: 8, fontFamily: 'var(--font-ui)',
                  }}
                />
                <button onClick={addItem} style={{
                  ...GLASS.accentBtn, padding: '8px 14px', fontSize: 12, borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <PlusIcon /> Add
                </button>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${GLASS.dividerColor}` }} />

            {/* Items */}
            <div style={{ ...GLASS.scrollList, padding: '8px 12px' }}>
              {pending.length === 0 && completed.length === 0 && (
                <div style={{ padding: '20px 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No items yet. Add one above.
                </div>
              )}

              {pending.map(renderItem)}

              {completed.length > 0 && (
                <>
                  <div style={{
                    padding: '12px 12px 6px', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5,
                    borderTop: pending.length > 0 ? `1px solid ${GLASS.dividerColor}` : 'none',
                    marginTop: pending.length > 0 ? 8 : 0,
                  }}>
                    Completed ({completed.length})
                  </div>
                  {completed.map(renderItem)}
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Create a list to get started
          </div>
        )}
      </div>
    </div>
  );
}

export default TodoApp;
