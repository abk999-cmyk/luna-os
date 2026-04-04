import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GLASS } from './glassStyles';
import { sanitizeHtml } from '../../utils/sanitize';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NoteData {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  tags?: string[];
  created: string;
  modified: string;
}

interface NotesProps {
  notes?: NoteData[];
  onChange?: (notes: NoteData[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function preview(html: string, max = 80): string {
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

const TAG_COLORS = ['#5b8fd4', '#a06cd5', '#d4a574', '#5a9e6f', '#e05252', '#d4d45a'];

const DEFAULT_NOTES: NoteData[] = [
  {
    id: '1',
    title: 'Meeting Notes',
    content: 'Discussed Q2 roadmap priorities. Action items: finalize spec, schedule design review.',
    pinned: true,
    tags: ['Work'],
    created: '2026-03-20T10:00:00Z',
    modified: '2026-03-25T14:30:00Z',
  },
  {
    id: '2',
    title: 'Shopping List',
    content: 'Milk, eggs, bread, avocados, coffee beans, olive oil',
    pinned: false,
    tags: ['Personal'],
    created: '2026-03-22T08:00:00Z',
    modified: '2026-03-26T09:00:00Z',
  },
  {
    id: '3',
    title: 'Book Recommendations',
    content: 'Designing Data-Intensive Applications, The Pragmatic Programmer, Staff Engineer',
    pinned: false,
    tags: ['Reading'],
    created: '2026-03-18T12:00:00Z',
    modified: '2026-03-18T12:00:00Z',
  },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    overflow: 'hidden',
  },
  sidebar: {
    width: 260,
    flexShrink: 0,
    borderRight: `1px solid ${GLASS.dividerColor}`,
    display: 'flex',
    flexDirection: 'column',
    ...GLASS.elevated,
  },
  sideHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  searchInput: {
    ...GLASS.inset,
    flex: 1,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    minWidth: 0,
  },
  newBtn: {
    ...GLASS.accentBtn,
    width: 30,
    height: 30,
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tagFilter: {
    display: 'flex',
    gap: 4,
    padding: '6px 12px',
    flexWrap: 'wrap',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  tagPill: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 10,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-ui)',
  },
  tagPillActive: {
    background: GLASS.selectedBg,
    borderColor: GLASS.selectedBorder,
    color: 'var(--accent-primary)',
  },
  noteList: {
    ...GLASS.scrollList,
  },
  noteItem: {
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    transition: 'background 0.1s',
  },
  noteItemActive: {
    background: GLASS.selectedBg,
  },
  noteItemTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 500,
    marginBottom: 4,
    fontSize: 13,
  },
  noteItemPreview: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  noteItemDate: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  editor: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  editorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  titleInput: {
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    flex: 1,
    minWidth: 0,
  },
  editorToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  fmtBtn: {
    ...GLASS.ghostBtn,
    padding: '3px 8px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  },
  editorBody: {
    flex: 1,
    padding: 16,
    overflowY: 'auto',
    outline: 'none',
    lineHeight: 1.6,
    fontSize: 14,
    color: 'var(--text-primary)',
    background: 'rgba(0,0,0,0.1)',
  },
  editorFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    borderTop: `1px solid ${GLASS.dividerColor}`,
    fontSize: 11,
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  },
  tagsRow: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  miniTag: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 500,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#e05252',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    padding: '4px 8px',
  },
  pinBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 6px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    padding: '4px 8px',
  },
  saveIndicator: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-tertiary)',
    fontSize: 14,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotesApp({ notes: notesProp, onChange }: NotesProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalNotes = useRef<string>(JSON.stringify(notesProp));

  const [notes, setNotes] = useState<NoteData[]>(notesProp ?? DEFAULT_NOTES);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify(notesProp);
    if (serialized === lastExternalNotes.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalNotes.current = serialized;
    if (notesProp) setNotes(notesProp);
  }, [notesProp]);

  const commit = useCallback((next: NoteData[]) => {
    isInternalEdit.current = true;
    setNotes(next);
    onChange?.(next);
  }, [onChange]);

  const active = useMemo(() => notes.find(n => n.id === activeId) ?? null, [notes, activeId]);

  // All tags
  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => n.tags?.forEach(t => s.add(t)));
    return Array.from(s);
  }, [notes]);

  // Filtered & sorted list
  const listed = useMemo(() => {
    let list = [...notes];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    if (filterTag) list = list.filter(n => n.tags?.includes(filterTag));
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.modified.localeCompare(a.modified);
    });
    return list;
  }, [notes, search, filterTag]);

  // Sync editor content when switching notes
  useEffect(() => {
    if (editorRef.current && active) {
      editorRef.current.innerHTML = active.content;
    }
  }, [activeId]); // intentionally only on id change

  const handleContentChange = () => {
    if (!editorRef.current || !active) return;
    const html = editorRef.current.innerHTML;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      commit(notes.map(n => n.id === active.id ? { ...n, content: html, modified: now() } : n));
      setSaveStatus('saved');
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    if (!active) return;
    commit(notes.map(n => n.id === active.id ? { ...n, title: val, modified: now() } : n));
  };

  const createNote = () => {
    const note: NoteData = {
      id: uid(),
      title: 'Untitled',
      content: '',
      pinned: false,
      tags: [],
      created: now(),
      modified: now(),
    };
    const next = [note, ...notes];
    commit(next);
    setActiveId(note.id);
  };

  const deleteNote = () => {
    if (!active) return;
    const next = notes.filter(n => n.id !== active.id);
    commit(next);
    setActiveId(next[0]?.id ?? null);
  };

  const togglePin = () => {
    if (!active) return;
    commit(notes.map(n => n.id === active.id ? { ...n, pinned: !n.pinned, modified: now() } : n));
  };

  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  return (
    <div style={S.root}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <input
            style={S.searchInput}
            placeholder="Search notes\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button style={S.newBtn} onClick={createNote} title="New note">+</button>
        </div>

        {allTags.length > 0 && (
          <div style={S.tagFilter}>
            <button
              style={{ ...S.tagPill, ...(filterTag === null ? S.tagPillActive : {}) }}
              onClick={() => setFilterTag(null)}
            >
              All
            </button>
            {allTags.map(t => (
              <button
                key={t}
                style={{ ...S.tagPill, ...(filterTag === t ? S.tagPillActive : {}) }}
                onClick={() => setFilterTag(filterTag === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div style={S.noteList}>
          {listed.map(n => (
            <div
              key={n.id}
              style={{ ...S.noteItem, ...(activeId === n.id ? S.noteItemActive : {}) }}
              onClick={() => setActiveId(n.id)}
              onMouseEnter={e => { if (activeId !== n.id) e.currentTarget.style.background = GLASS.hoverBg; }}
              onMouseLeave={e => { if (activeId !== n.id) e.currentTarget.style.background = 'none'; }}
            >
              <div style={S.noteItemTitle}>
                {n.pinned && <span title="Pinned" style={{ color: 'var(--accent-primary)' }}>{'\u{1F4CC}'}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
              </div>
              <div style={S.noteItemPreview}>{preview(n.content)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={S.noteItemDate}>{fmtDate(n.modified)}</span>
                {n.tags?.map((t, i) => (
                  <span
                    key={t}
                    style={{
                      ...S.miniTag,
                      background: `${TAG_COLORS[i % TAG_COLORS.length]}22`,
                      color: TAG_COLORS[i % TAG_COLORS.length],
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {listed.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No notes found
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      {active ? (
        <div style={S.editor}>
          <div style={S.editorHeader}>
            <input
              style={S.titleInput}
              value={active.title}
              onChange={e => handleTitleChange(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button style={S.pinBtn} onClick={togglePin} title={active.pinned ? 'Unpin' : 'Pin'}>
                {active.pinned ? '\u{1F4CC}' : '\u{1F4C4}'}
              </button>
              <button style={S.deleteBtn} onClick={deleteNote} title="Delete note">Delete</button>
            </div>
          </div>

          {/* Formatting toolbar */}
          <div style={S.editorToolbar}>
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}><b>B</b></button>
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}><i>I</i></button>
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}><u>U</u></button>
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('strikeThrough'); }}><s>S</s></button>
            <span style={{ width: 1, height: 16, background: GLASS.dividerColor, margin: '0 4px' }} />
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}>List</button>
            <button style={S.fmtBtn} onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }}>Num</button>
          </div>

          {/* Content editable area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            style={S.editorBody}
            onInput={handleContentChange}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(active.content) }}
          />

          <div style={S.editorFooter}>
            <div style={S.tagsRow}>
              Tags:&nbsp;
              {active.tags?.map((t, i) => (
                <span
                  key={t}
                  style={{
                    ...S.miniTag,
                    background: `${TAG_COLORS[i % TAG_COLORS.length]}22`,
                    color: TAG_COLORS[i % TAG_COLORS.length],
                  }}
                >
                  {t}
                </span>
              ))}
              <button
                style={S.iconBtn}
                onClick={() => {
                  const tag = prompt('Add tag:');
                  if (tag?.trim()) {
                    commit(notes.map(n =>
                      n.id === active.id
                        ? { ...n, tags: [...(n.tags ?? []).filter(t => t !== tag.trim()), tag.trim()], modified: now() }
                        : n,
                    ));
                  }
                }}
              >
                +
              </button>
            </div>
            <span style={S.saveIndicator}>
              {saveStatus === 'saving' ? 'Saving\u2026' : saveStatus === 'saved' ? 'Saved' : `Modified ${fmtDate(active.modified)}`}
            </span>
          </div>
        </div>
      ) : (
        <div style={S.empty}>Select a note or create a new one</div>
      )}
    </div>
  );
}

export default NotesApp;
