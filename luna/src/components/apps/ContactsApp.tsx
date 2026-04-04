import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GLASS } from './glassStyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string[];
  email: string[];
  address: string;
  notes: string;
  group: 'Family' | 'Work' | 'Friends';
}

export interface ContactsAppProps {
  contacts?: Contact[];
  onChange?: (contacts: Contact[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 45%, 40%)`;
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

let _idCounter = 100;
function newId(): string { return `c_${++_idCounter}_${Date.now()}`; }

const DEFAULT_CONTACTS: Contact[] = [
  { id: 'c1', firstName: 'Alice', lastName: 'Chen', phone: ['+1 415-555-0101'], email: ['alice.chen@mail.com'], address: '123 Market St, San Francisco, CA', notes: '', group: 'Work' },
  { id: 'c2', firstName: 'Ben', lastName: 'Alvarez', phone: ['+1 212-555-0102'], email: ['ben.alvarez@gmail.com'], address: '', notes: 'Met at React Conf', group: 'Friends' },
  { id: 'c3', firstName: 'Carmen', lastName: 'Brooks', phone: ['+1 310-555-0103', '+1 310-555-0104'], email: ['carmen@brooks.co'], address: '456 Sunset Blvd, Los Angeles, CA', notes: '', group: 'Family' },
  { id: 'c4', firstName: 'David', lastName: 'Kim', phone: ['+1 650-555-0105'], email: ['dkim@startup.io', 'd.kim@personal.com'], address: '', notes: 'CTO at Startup', group: 'Work' },
  { id: 'c5', firstName: 'Elena', lastName: 'Torres', phone: ['+1 503-555-0106'], email: ['elena.t@outlook.com'], address: '789 Pine Ave, Portland, OR', notes: '', group: 'Friends' },
  { id: 'c6', firstName: 'Frank', lastName: 'Nguyen', phone: ['+1 408-555-0107'], email: ['frank.nguyen@corp.com'], address: '', notes: 'Design lead', group: 'Work' },
  { id: 'c7', firstName: 'Grace', lastName: 'Alvarez', phone: ['+1 718-555-0108'], email: ['grace.a@mail.com'], address: '321 Oak St, Brooklyn, NY', notes: '', group: 'Family' },
  { id: 'c8', firstName: 'Hiro', lastName: 'Tanaka', phone: ['+81 90-1234-5678'], email: ['hiro@tanaka.jp'], address: '', notes: 'Tokyo office', group: 'Work' },
  { id: 'c9', firstName: 'Isabel', lastName: 'Martinez', phone: ['+1 305-555-0110'], email: ['isa.martinez@gmail.com'], address: '567 Palm Dr, Miami, FL', notes: '', group: 'Friends' },
  { id: 'c10', firstName: 'James', lastName: 'Chen', phone: ['+1 415-555-0111'], email: ['james.c@mail.com'], address: '', notes: "Alice's brother", group: 'Family' },
  { id: 'c11', firstName: 'Karen', lastName: 'Lee', phone: ['+1 617-555-0112'], email: ['karen.lee@work.com'], address: '890 Beacon St, Boston, MA', notes: '', group: 'Work' },
  { id: 'c12', firstName: 'Leo', lastName: 'Rossi', phone: ['+39 333-456-7890'], email: ['leo.rossi@mail.it'], address: '', notes: 'Milan trip contact', group: 'Friends' },
];

const GROUPS = ['All', 'Family', 'Work', 'Friends'] as const;

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactsApp({ contacts: initialContacts, onChange }: ContactsAppProps) {
  const [contacts, setContacts] = useState<Contact[]>(() => initialContacts || DEFAULT_CONTACTS);
  const isInitialMount = useRef(true);

  // Sync state changes back via onChange
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onChange?.(contacts);
  }, [contacts, onChange]);
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<typeof GROUPS[number]>('All');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Contact | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(false);

  const filtered = useMemo(() => {
    let list = contacts;
    if (groupFilter !== 'All') list = list.filter(c => c.group === groupFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email.some(e => e.toLowerCase().includes(q)) ||
        c.phone.some(p => p.includes(q))
      );
    }
    return list.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [contacts, search, groupFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, Contact[]> = {};
    for (const c of filtered) {
      const letter = c.lastName.charAt(0).toUpperCase();
      (map[letter] ||= []).push(c);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selected = useMemo(() => contacts.find(c => c.id === selectedId) ?? null, [contacts, selectedId]);

  const startEdit = useCallback(() => {
    if (!selected) return;
    setDraft({ ...selected, phone: [...selected.phone], email: [...selected.email] });
    setEditing(true);
  }, [selected]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft(null);
    // If it was a new empty contact, remove it
    if (draft && !draft.firstName && !draft.lastName) {
      setContacts(prev => prev.filter(c => c.id !== draft.id));
      setSelectedId(contacts[0]?.id ?? null);
    }
  }, [draft, contacts]);

  const saveEdit = useCallback(() => {
    if (!draft) return;
    setContacts(prev => prev.map(c => c.id === draft.id ? draft : c));
    setSelectedId(draft.id);
    setEditing(false);
    setDraft(null);
  }, [draft]);

  const addContact = useCallback(() => {
    const c: Contact = {
      id: newId(), firstName: '', lastName: '', phone: [''], email: [''],
      address: '', notes: '', group: 'Friends',
    };
    setContacts(prev => [...prev, c]);
    setSelectedId(c.id);
    setDraft({ ...c, phone: [...c.phone], email: [...c.email] });
    setEditing(true);
  }, []);

  const deleteContact = useCallback(() => {
    if (!selectedId) return;
    setContacts(prev => prev.filter(c => c.id !== selectedId));
    setSelectedId(filtered.find(c => c.id !== selectedId)?.id ?? null);
    setEditing(false);
    setDraft(null);
    setShowDeleteConfirm(false);
  }, [selectedId, filtered]);

  const exportVCard = useCallback((contact: Contact) => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contact.firstName} ${contact.lastName}`,
      `N:${contact.lastName};${contact.firstName}`,
      ...contact.email.filter(Boolean).map(e => `EMAIL:${e}`),
      ...contact.phone.filter(Boolean).map(p => `TEL:${p}`),
      contact.address ? `ADR:;;${contact.address}` : '',
      'END:VCARD',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(vcard).then(() => {
      setExportFeedback(true);
      setTimeout(() => setExportFeedback(false), 2000);
    });
  }, []);

  const updateDraftField = useCallback((field: keyof Contact, value: any) => {
    setDraft(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const updateDraftArrayItem = useCallback((field: 'phone' | 'email', idx: number, value: string) => {
    setDraft(prev => {
      if (!prev) return null;
      const arr = [...prev[field]];
      arr[idx] = value;
      return { ...prev, [field]: arr };
    });
  }, []);

  const addDraftArrayItem = useCallback((field: 'phone' | 'email') => {
    setDraft(prev => {
      if (!prev) return null;
      return { ...prev, [field]: [...prev[field], ''] };
    });
  }, []);

  const current = editing ? draft : selected;

  return (
    <div style={{ ...GLASS.appRoot, flexDirection: 'row' }}>
      {/* Left panel */}
      <div style={{
        width: 280, minWidth: 280, display: 'flex', flexDirection: 'column',
        ...GLASS.elevated, borderRadius: 0, borderRight: `1px solid ${GLASS.dividerColor}`,
        borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
      }}>
        {/* Search + Add */}
        <div style={{ padding: '10px 12px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            ...GLASS.inset, padding: '6px 10px', borderRadius: 8,
          }}>
            <SearchIcon />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-ui)',
                flex: 1, padding: 0,
              }}
            />
          </div>
          <button onClick={addContact} style={{
            ...GLASS.ghostBtn, width: 30, height: 30, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}><PlusIcon /></button>
        </div>

        {/* Group filters */}
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {GROUPS.map(g => (
            <button key={g} onClick={() => setGroupFilter(g)} style={{
              ...(groupFilter === g ? GLASS.tabActive : GLASS.tab),
              padding: '3px 10px', fontSize: 11, borderRadius: 9999,
            }}>{g}</button>
          ))}
        </div>

        {/* Contact list */}
        <div style={{ ...GLASS.scrollList, borderTop: `1px solid ${GLASS.dividerColor}` }}>
          {grouped.map(([letter, cList]) => (
            <div key={letter}>
              <div style={{
                padding: '8px 14px 4px', fontSize: 11, fontWeight: 600,
                color: 'var(--text-secondary)', letterSpacing: 0.5,
              }}>{letter}</div>
              {cList.map(c => {
                const isSel = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedId(c.id); setEditing(false); setDraft(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', cursor: 'pointer',
                      background: isSel ? GLASS.selectedBg : 'transparent',
                      borderLeft: isSel ? `2px solid ${GLASS.accentColor}` : '2px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget.style.background = GLASS.hoverBg); }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget.style.background = 'transparent'); }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 17, flexShrink: 0,
                      background: hashColor(`${c.firstName}${c.lastName}`),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                    }}>{initials(c.firstName, c.lastName)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.firstName} {c.lastName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.phone[0] || c.email[0] || ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
              No contacts found.
            </div>
          )}
        </div>
      </div>

      {/* Right detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {current ? (
          <>
            {/* Top bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              padding: '10px 16px', gap: 6,
              borderBottom: `1px solid ${GLASS.dividerColor}`,
            }}>
              {editing ? (
                <>
                  <button onClick={cancelEdit} style={{ ...GLASS.ghostBtn, padding: '5px 12px', fontSize: 12, borderRadius: 8 }}>Cancel</button>
                  <button onClick={saveEdit} style={{ ...GLASS.accentBtn, padding: '5px 12px', fontSize: 12, borderRadius: 8 }}>Save</button>
                </>
              ) : (
                <>
                  {exportFeedback && (
                    <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 500 }}>
                      vCard copied!
                    </span>
                  )}
                  <button onClick={() => selected && exportVCard(selected)} title="Export vCard" style={{
                    ...GLASS.ghostBtn, width: 30, height: 30, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}><ExportIcon /></button>
                  <button onClick={startEdit} style={{
                    ...GLASS.ghostBtn, width: 30, height: 30, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}><PencilIcon /></button>
                  <button onClick={() => setShowDeleteConfirm(true)} style={{
                    ...GLASS.ghostBtn, width: 30, height: 30, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    color: '#ef4444',
                  }}><TrashIcon /></button>
                </>
              )}
            </div>

            {/* Detail content */}
            <div style={{ ...GLASS.scrollList, padding: '24px 28px' }}>
              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 32, flexShrink: 0,
                  background: hashColor(`${current.firstName}${current.lastName}`),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                }}>{initials(current.firstName || '?', current.lastName || '?')}</div>
                <div>
                  {editing ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={draft?.firstName ?? ''} onChange={e => updateDraftField('firstName', e.target.value)}
                        placeholder="First name" style={{ ...GLASS.inset, padding: '6px 10px', fontSize: 16, fontWeight: 600, width: 140, borderRadius: 8 }} />
                      <input value={draft?.lastName ?? ''} onChange={e => updateDraftField('lastName', e.target.value)}
                        placeholder="Last name" style={{ ...GLASS.inset, padding: '6px 10px', fontSize: 16, fontWeight: 600, width: 140, borderRadius: 8 }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{current.firstName} {current.lastName}</div>
                  )}
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 500,
                    background: GLASS.selectedBg, color: 'var(--accent-primary)',
                  }}>
                    {editing ? (
                      <select value={draft?.group ?? 'Friends'}
                        onChange={e => updateDraftField('group', e.target.value)}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                        <option value="Family">Family</option>
                        <option value="Work">Work</option>
                        <option value="Friends">Friends</option>
                      </select>
                    ) : current.group}
                  </div>
                </div>
              </div>

              {/* Fields */}
              {renderSection('Phone', current.phone, editing, draft?.phone,
                (idx, val) => updateDraftArrayItem('phone', idx, val),
                () => addDraftArrayItem('phone'), '+1 555-000-0000')}

              {renderSection('Email', current.email, editing, draft?.email,
                (idx, val) => updateDraftArrayItem('email', idx, val),
                () => addDraftArrayItem('email'), 'name@example.com')}

              {/* Address */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Address</div>
                {editing ? (
                  <textarea value={draft?.address ?? ''} onChange={e => updateDraftField('address', e.target.value)}
                    placeholder="Street, City, State" rows={2}
                    style={{ ...GLASS.inset, padding: '8px 10px', fontSize: 13, width: '100%', resize: 'vertical', fontFamily: 'var(--font-ui)', borderRadius: 8 }} />
                ) : (
                  <div style={{ fontSize: 13, color: current.address ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {current.address || 'No address'}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</div>
                {editing ? (
                  <textarea value={draft?.notes ?? ''} onChange={e => updateDraftField('notes', e.target.value)}
                    placeholder="Add notes..." rows={3}
                    style={{ ...GLASS.inset, padding: '8px 10px', fontSize: 13, width: '100%', resize: 'vertical', fontFamily: 'var(--font-ui)', borderRadius: 8 }} />
                ) : (
                  <div style={{ fontSize: 13, color: current.notes ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {current.notes || 'No notes'}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Select a contact
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            ...GLASS.elevated, borderRadius: 12, padding: '20px 24px', width: 300,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Delete contact?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              "{selected?.firstName} {selected?.lastName}" will be permanently removed.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)}
                style={{ ...GLASS.ghostBtn, padding: '6px 14px', fontSize: 12, borderRadius: 8 }}>Cancel</button>
              <button onClick={deleteContact}
                style={{ ...GLASS.accentBtn, padding: '6px 14px', fontSize: 12, borderRadius: 8, background: '#ef4444', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field section renderer
// ---------------------------------------------------------------------------

function renderSection(
  label: string, values: string[], editing: boolean, draftValues: string[] | undefined,
  onChange: (idx: number, val: string) => void, onAdd: () => void, placeholder: string,
) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(draftValues ?? []).map((v, i) => (
            <input key={i} value={v} onChange={e => onChange(i, e.target.value)}
              placeholder={placeholder}
              style={{ ...GLASS.inset, padding: '6px 10px', fontSize: 13, borderRadius: 8 }} />
          ))}
          <button onClick={onAdd} style={{
            ...GLASS.ghostBtn, padding: '4px 10px', fontSize: 11, borderRadius: 8,
            alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <PlusIcon /> Add {label.toLowerCase()}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {values.filter(Boolean).map((v, i) => (
            <div key={i} style={{ fontSize: 13 }}>{v}</div>
          ))}
          {values.filter(Boolean).length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>None</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ContactsApp;
