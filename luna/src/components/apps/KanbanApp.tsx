import React, { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  labels?: string[];
  assignee?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

interface KanbanProps {
  columns?: KanbanColumn[];
  onChange?: (columns: KanbanColumn[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e05252',
  medium: '#d4a574',
  low: '#5a9e6f',
};

const LABEL_COLORS: string[] = [
  '#5b8fd4', '#a06cd5', '#d4a574', '#5a9e6f', '#e05252', '#d4d45a',
];

const DEFAULT_COLUMNS: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To Do',
    cards: [
      { id: '1', title: 'Research competitors', description: 'Analyze top 5 competitor products', labels: ['Research'], priority: 'high', assignee: 'AK' },
      { id: '2', title: 'Design mockups', labels: ['Design'], priority: 'medium', assignee: 'LM' },
    ],
  },
  {
    id: 'progress',
    title: 'In Progress',
    cards: [
      { id: '3', title: 'Build API endpoints', description: 'REST API for user management', labels: ['Backend'], priority: 'high', assignee: 'JD' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    cards: [
      { id: '4', title: 'Project kickoff', labels: ['Planning'], priority: 'low', assignee: 'AK' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--surface-base, #1a1614)',
    color: 'var(--text-primary, #e8e0d8)',
    fontFamily: 'var(--font-system, system-ui)',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid var(--border-subtle, #3a332e)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    background: 'var(--surface-elevated, #2a2420)',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600 },
  addColBtn: {
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
  },
  board: {
    display: 'flex',
    gap: 12,
    flex: 1,
    overflowX: 'auto',
    padding: 16,
    alignItems: 'flex-start',
  },
  column: {
    minWidth: 260,
    maxWidth: 300,
    background: 'var(--surface-elevated, #2a2420)',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    flexShrink: 0,
  },
  colHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    fontWeight: 600,
    fontSize: 13,
  },
  colCount: {
    background: 'rgba(212,165,116,0.15)',
    color: 'var(--color-accent, #d4a574)',
    borderRadius: 10,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 500,
  },
  colBody: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 60,
  },
  card: {
    background: 'var(--surface-base, #1a1614)',
    borderRadius: 8,
    padding: 10,
    cursor: 'grab',
    border: '1px solid var(--border-subtle, #3a332e)',
    transition: 'border-color 0.15s',
  },
  cardDragging: {
    opacity: 0.5,
    border: '1px dashed var(--color-accent, #d4a574)',
  },
  cardTitle: { fontWeight: 500, marginBottom: 6 },
  cardDesc: { fontSize: 12, color: 'var(--text-secondary, #b0a898)', marginBottom: 6 },
  labels: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  label: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 500,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'rgba(212,165,116,0.2)',
    color: 'var(--color-accent, #d4a574)',
    fontSize: 10,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  addCardBtn: {
    background: 'none',
    border: '1px dashed var(--border-subtle, #3a332e)',
    borderRadius: 8,
    color: 'var(--text-tertiary, #6a6058)',
    padding: '8px 0',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
    width: '100%',
    margin: '4px 8px 8px',
    boxSizing: 'border-box',
  },
  dropZone: {
    borderRadius: 8,
    border: '2px dashed var(--color-accent, #d4a574)',
    padding: 20,
    textAlign: 'center',
    color: 'var(--text-tertiary, #6a6058)',
    fontSize: 12,
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: 'var(--surface-elevated, #2a2420)',
    borderRadius: 12,
    padding: 24,
    width: 400,
    maxWidth: '90vw',
    border: '1px solid var(--border-subtle, #3a332e)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  },
  modalTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16 },
  formField: { marginBottom: 12 },
  formLabel: { display: 'block', fontSize: 12, color: 'var(--text-secondary, #b0a898)', marginBottom: 4 },
  formInput: {
    width: '100%',
    background: 'var(--surface-base, #1a1614)',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    padding: '7px 10px',
    color: 'var(--text-primary, #e8e0d8)',
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  formTextarea: {
    width: '100%',
    background: 'var(--surface-base, #1a1614)',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    padding: '7px 10px',
    color: 'var(--text-primary, #e8e0d8)',
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
    outline: 'none',
    resize: 'vertical',
    minHeight: 60,
    boxSizing: 'border-box',
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btnPrimary: {
    background: 'var(--color-accent, #d4a574)',
    border: 'none',
    borderRadius: 6,
    color: '#1a1614',
    padding: '7px 16px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
  },
  btnSecondary: {
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    padding: '7px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-system, system-ui)',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function KanbanApp({ columns: colsProp, onChange }: KanbanProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalColumns = useRef<string>(JSON.stringify(colsProp));

  const [columns, setColumns] = useState<KanbanColumn[]>(colsProp ?? DEFAULT_COLUMNS);
  const [dragCard, setDragCard] = useState<{ cardId: string; fromCol: string } | null>(null);
  const [editCard, setEditCard] = useState<{ colId: string; card: KanbanCard } | null>(null);
  const [editForm, setEditForm] = useState<KanbanCard>({ id: '', title: '' });

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify(colsProp);
    if (serialized === lastExternalColumns.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalColumns.current = serialized;
    if (colsProp) setColumns(colsProp);
  }, [colsProp]);

  const commit = useCallback((next: KanbanColumn[]) => {
    isInternalEdit.current = true;
    setColumns(next);
    onChange?.(next);
  }, [onChange]);

  /* ---- Drag & Drop via native HTML drag ---- */
  const handleDragStart = (cardId: string, colId: string) => {
    setDragCard({ cardId, fromCol: colId });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetColId: string) => {
    if (!dragCard) return;
    if (dragCard.fromCol === targetColId) { setDragCard(null); return; }
    const next = columns.map(col => ({ ...col, cards: [...col.cards] }));
    const srcCol = next.find(c => c.id === dragCard.fromCol);
    const dstCol = next.find(c => c.id === targetColId);
    if (!srcCol || !dstCol) { setDragCard(null); return; }
    const cardIdx = srcCol.cards.findIndex(c => c.id === dragCard.cardId);
    if (cardIdx === -1) { setDragCard(null); return; }
    const [card] = srcCol.cards.splice(cardIdx, 1);
    dstCol.cards.push(card);
    commit(next);
    setDragCard(null);
  };

  /* ---- Card CRUD ---- */
  const addCard = (colId: string) => {
    const card: KanbanCard = { id: uid(), title: 'New Card' };
    commit(columns.map(c => c.id === colId ? { ...c, cards: [...c.cards, card] } : c));
  };

  const addColumn = () => {
    commit([...columns, { id: uid(), title: 'New Column', cards: [] }]);
  };

  const openEdit = (colId: string, card: KanbanCard) => {
    setEditCard({ colId, card });
    setEditForm({ ...card });
  };

  const saveEdit = () => {
    if (!editCard) return;
    commit(
      columns.map(c =>
        c.id === editCard.colId
          ? { ...c, cards: c.cards.map(card => card.id === editCard.card.id ? { ...editForm } : card) }
          : c,
      ),
    );
    setEditCard(null);
  };

  const deleteCard = () => {
    if (!editCard) return;
    commit(
      columns.map(c =>
        c.id === editCard.colId
          ? { ...c, cards: c.cards.filter(card => card.id !== editCard.card.id) }
          : c,
      ),
    );
    setEditCard(null);
  };

  /* ---- Render ---- */

  const renderCard = (card: KanbanCard, colId: string) => (
    <div
      key={card.id}
      draggable
      onDragStart={() => handleDragStart(card.id, colId)}
      onDragEnd={() => setDragCard(null)}
      style={{
        ...S.card,
        ...(dragCard?.cardId === card.id ? S.cardDragging : {}),
      }}
      onClick={() => openEdit(colId, card)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent, #d4a574)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle, #3a332e)'; }}
    >
      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div style={S.labels}>
          {card.labels.map((lbl, i) => (
            <span
              key={lbl}
              style={{
                ...S.label,
                background: `${LABEL_COLORS[i % LABEL_COLORS.length]}22`,
                color: LABEL_COLORS[i % LABEL_COLORS.length],
              }}
            >
              {lbl}
            </span>
          ))}
        </div>
      )}
      <div style={S.cardTitle}>{card.title}</div>
      {card.description && <div style={S.cardDesc}>{card.description}</div>}
      <div style={S.cardFooter}>
        {card.priority && (
          <span
            style={{ ...S.priorityDot, background: PRIORITY_COLORS[card.priority] }}
            title={card.priority}
          />
        )}
        {card.assignee && <div style={S.avatar}>{card.assignee}</div>}
      </div>
    </div>
  );

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>Kanban Board</span>
        <button style={S.addColBtn} onClick={addColumn}>+ Column</button>
      </div>

      {/* Board */}
      <div style={S.board}>
        {columns.map(col => (
          <div key={col.id} style={S.column}>
            <div style={S.colHeader}>
              <span>{col.title}</span>
              <span style={S.colCount}>{col.cards.length}</span>
            </div>
            <div
              style={S.colBody}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(col.id)}
            >
              {col.cards.map(card => renderCard(card, col.id))}
              {dragCard && dragCard.fromCol !== col.id && col.cards.length === 0 && (
                <div style={S.dropZone}>Drop here</div>
              )}
            </div>
            <button style={S.addCardBtn} onClick={() => addCard(col.id)}>+ Add Card</button>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editCard && (
        <div style={S.overlay} onClick={() => setEditCard(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>Edit Card</div>
            <div style={S.formField}>
              <label style={S.formLabel}>Title</label>
              <input
                style={S.formInput}
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div style={S.formField}>
              <label style={S.formLabel}>Description</label>
              <textarea
                style={S.formTextarea as React.CSSProperties}
                value={editForm.description ?? ''}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div style={S.formField}>
              <label style={S.formLabel}>Priority</label>
              <select
                style={S.formInput}
                value={editForm.priority ?? ''}
                onChange={e => setEditForm({ ...editForm, priority: (e.target.value || undefined) as KanbanCard['priority'] })}
              >
                <option value="">None</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={S.formField}>
              <label style={S.formLabel}>Assignee</label>
              <input
                style={S.formInput}
                value={editForm.assignee ?? ''}
                onChange={e => setEditForm({ ...editForm, assignee: e.target.value })}
                placeholder="Initials (e.g., AK)"
              />
            </div>
            <div style={S.formField}>
              <label style={S.formLabel}>Labels (comma-separated)</label>
              <input
                style={S.formInput}
                value={(editForm.labels ?? []).join(', ')}
                onChange={e => setEditForm({ ...editForm, labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              />
            </div>
            <div style={S.modalActions}>
              <button style={{ ...S.btnSecondary, color: '#e05252' }} onClick={deleteCard}>Delete</button>
              <button style={S.btnSecondary} onClick={() => setEditCard(null)}>Cancel</button>
              <button style={S.btnPrimary} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KanbanApp;
