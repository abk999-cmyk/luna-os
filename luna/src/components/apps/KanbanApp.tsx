import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GLASS } from './glassStyles';

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
    ...GLASS.appRoot,
  },
  header: {
    ...GLASS.elevated,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600 },
  addColBtn: {
    ...GLASS.ghostBtn,
    padding: '5px 12px',
    fontSize: 13,
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
    ...GLASS.surface,
    minWidth: 260,
    maxWidth: 300,
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
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    fontWeight: 600,
    fontSize: 13,
    background: 'rgba(255, 255, 255, 0.03)',
  },
  colCount: {
    background: GLASS.selectedBg,
    color: 'var(--accent-primary)',
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
    ...GLASS.elevated,
    borderRadius: 8,
    padding: 10,
    cursor: 'grab',
    transition: 'border-color 0.15s',
  },
  cardDragging: {
    opacity: 0.5,
    border: `1px dashed var(--accent-primary)`,
  },
  cardTitle: { fontWeight: 500, marginBottom: 6 },
  cardDesc: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 },
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
    background: GLASS.selectedBg,
    color: 'var(--accent-primary)',
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
    border: `1px dashed ${GLASS.dividerColor}`,
    borderRadius: 8,
    color: 'var(--text-tertiary)',
    padding: '8px 0',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    width: '100%',
    margin: '4px 8px 8px',
    boxSizing: 'border-box',
    transition: 'background 0.15s, color 0.15s',
  },
  dropZone: {
    borderRadius: 8,
    border: `2px dashed var(--accent-primary)`,
    padding: 20,
    textAlign: 'center',
    color: 'var(--text-tertiary)',
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
    background: 'var(--glass-bg-elevated)',
    backdropFilter: 'blur(60px) saturate(200%)',
    WebkitBackdropFilter: 'blur(60px) saturate(200%)',
    borderRadius: 12,
    padding: 24,
    width: 400,
    maxWidth: '90vw',
    border: '1px solid var(--glass-edge-light)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  },
  modalTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16 },
  formField: { marginBottom: 12 },
  formLabel: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 },
  formInput: {
    ...GLASS.inset,
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    boxSizing: 'border-box',
  },
  formTextarea: {
    ...GLASS.inset,
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    resize: 'vertical',
    minHeight: 60,
    boxSizing: 'border-box',
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btnPrimary: {
    ...GLASS.accentBtn,
    padding: '7px 16px',
    fontSize: 13,
  },
  btnSecondary: {
    ...GLASS.ghostBtn,
    padding: '7px 16px',
    fontSize: 13,
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
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
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

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(colId);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (targetColId: string) => {
    if (!dragCard) return;
    setDropTarget(null);
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
      onDragEnd={() => { setDragCard(null); setDropTarget(null); }}
      style={{
        ...S.card,
        ...(dragCard?.cardId === card.id ? S.cardDragging : {}),
      }}
      onClick={() => { if (!dragCard) setSelectedCard(card); }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = GLASS.selectedBorder; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-edge-light)'; }}
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
              style={{
                ...S.colBody,
                ...(dropTarget === col.id ? { background: GLASS.selectedBg, transition: 'background 0.15s' } : {}),
              }}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
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

      {/* Card Detail Modal */}
      {selectedCard && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setSelectedCard(null)}>
          <div style={{ ...GLASS.elevated, borderRadius: 12, width: 400, maxHeight: '80%', overflow: 'auto', padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedCard.title}</h3>
              <button onClick={() => setSelectedCard(null)} style={{ ...GLASS.ghostBtn, padding: '2px 8px', fontSize: 14 }}>&#x2715;</button>
            </div>
            {selectedCard.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>{selectedCard.description}</p>}
            {selectedCard.labels && selectedCard.labels.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {selectedCard.labels.map((l, i) => (
                  <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: 'rgba(126,184,255,0.15)', color: '#7eb8ff' }}>{l}</span>
                ))}
              </div>
            )}
            {selectedCard.priority && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Priority: {selectedCard.priority}</div>}
            {selectedCard.assignee && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Assignee: {selectedCard.assignee}</div>}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button style={S.btnPrimary} onClick={() => {
                const col = columns.find(c => c.cards.some(card => card.id === selectedCard.id));
                if (col) { openEdit(col.id, selectedCard); setSelectedCard(null); }
              }}>Edit</button>
            </div>
          </div>
        </div>
      )}

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
