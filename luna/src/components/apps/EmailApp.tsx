import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  folder: string;
  attachments?: { name: string; size: string }[];
}

export interface FolderData {
  name: string;
  icon: string;
  unreadCount?: number;
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}

export interface EmailAppProps {
  emails?: EmailMessage[];
  folders?: FolderData[];
  onSend?: (email: EmailDraft) => void;
  onChange?: (emails: EmailMessage[]) => void;
}

// ─── Default Data ────────────────────────────────────────────────────────────

const DEFAULT_FOLDERS: FolderData[] = [
  { name: 'Inbox', icon: '📥', unreadCount: 3 },
  { name: 'Starred', icon: '⭐' },
  { name: 'Sent', icon: '📤' },
  { name: 'Drafts', icon: '📝', unreadCount: 1 },
  { name: 'Archive', icon: '📦' },
  { name: 'Trash', icon: '🗑️' },
];

const DEFAULT_EMAILS: EmailMessage[] = [
  {
    id: '1',
    from: 'alice@luna.dev',
    to: ['you@luna.dev'],
    subject: 'Welcome to Luna OS',
    body: '<h2>Welcome!</h2><p>Thank you for joining Luna OS. We are excited to have you on board.</p><p>Luna OS is a modern, agent-driven operating system designed to help you work smarter. Explore the built-in apps, customize your workspace, and let the AI assistant help you with everyday tasks.</p><p>Best regards,<br/>The Luna Team</p>',
    date: '2026-03-27T09:00:00Z',
    read: false,
    starred: false,
    folder: 'Inbox',
  },
  {
    id: '2',
    from: 'bob@luna.dev',
    to: ['you@luna.dev'],
    cc: ['team@luna.dev'],
    subject: 'Sprint Review Notes',
    body: '<p>Hi team,</p><p>Here are the notes from today\'s sprint review:</p><ul><li>Email client component completed</li><li>Window manager improvements merged</li><li>Agent conductor streaming is stable</li></ul><p>Next sprint starts Monday. Please update your task boards.</p><p>Cheers,<br/>Bob</p>',
    date: '2026-03-27T08:30:00Z',
    read: false,
    starred: true,
    folder: 'Inbox',
  },
  {
    id: '3',
    from: 'system@luna.dev',
    to: ['you@luna.dev'],
    subject: 'Security Alert: New login detected',
    body: '<p>A new login to your Luna OS account was detected.</p><p><strong>Device:</strong> MacBook Pro<br/><strong>Location:</strong> San Francisco, CA<br/><strong>Time:</strong> March 27, 2026 at 7:15 AM</p><p>If this was you, no action is needed. If not, please change your password immediately.</p>',
    date: '2026-03-26T15:15:00Z',
    read: false,
    starred: false,
    folder: 'Inbox',
  },
  {
    id: '4',
    from: 'you@luna.dev',
    to: ['alice@luna.dev'],
    subject: 'Re: Project Timeline',
    body: '<p>Hi Alice,</p><p>Thanks for the update. I think the revised timeline looks good. Let\'s sync up tomorrow to finalize the milestones.</p><p>Best,<br/>Me</p>',
    date: '2026-03-25T14:00:00Z',
    read: true,
    starred: false,
    folder: 'Sent',
  },
  {
    id: '5',
    from: 'newsletter@luna.dev',
    to: ['you@luna.dev'],
    subject: 'Luna OS Weekly Digest - March 2026',
    body: '<h3>This Week in Luna OS</h3><p>New features shipped this week:</p><ol><li>Dark theme refinements across all apps</li><li>Improved memory subsystem performance</li><li>New email client app</li></ol><p>Stay tuned for more updates next week!</p>',
    date: '2026-03-24T10:00:00Z',
    read: true,
    starred: false,
    folder: 'Inbox',
  },
  {
    id: '6',
    from: 'you@luna.dev',
    to: ['team@luna.dev'],
    subject: 'Draft: Q2 Planning Document',
    body: '<p>Draft notes for Q2 planning...</p><p><em>This is still a work in progress.</em></p>',
    date: '2026-03-23T16:30:00Z',
    read: true,
    starred: false,
    folder: 'Drafts',
  },
];

// ─── Utility Helpers ─────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function truncate(str: string, len: number): string {
  const stripped = str.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  return stripped.length > len ? stripped.slice(0, len) + '...' : stripped;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const cssVars = {
  surfaceBase: 'var(--surface-base, #1a1614)',
  surfaceElevated: 'var(--surface-elevated, #2a2420)',
  colorAccent: 'var(--color-accent, #d4a574)',
  borderSubtle: 'var(--border-subtle, #3a332e)',
  textPrimary: 'var(--text-primary, #e8e0d8)',
  fontSystem: 'var(--font-system, system-ui)',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    background: cssVars.surfaceBase,
    color: cssVars.textPrimary,
    fontFamily: cssVars.fontSystem,
    fontSize: 13,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── Sidebar ──
  sidebar: {
    width: 200,
    minWidth: 200,
    background: cssVars.surfaceElevated,
    borderRight: `1px solid ${cssVars.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sidebarCollapsed: {
    width: 48,
    minWidth: 48,
  },
  sidebarHeader: {
    padding: '12px 14px',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  composeBtn: {
    flex: 1,
    padding: '8px 14px',
    background: cssVars.colorAccent,
    color: '#1a1614',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  composeBtnCollapsed: {
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: '50%',
    flex: 'none',
    fontSize: 16,
  },
  folderList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '6px 0',
  },
  folderItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.15s',
    userSelect: 'none' as const,
    position: 'relative' as const,
  },
  folderItemActive: {
    background: 'rgba(212,165,116,0.15)',
  },
  folderIcon: {
    fontSize: 15,
    width: 20,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  folderName: {
    flex: 1,
    fontSize: 13,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  folderBadge: {
    background: cssVars.colorAccent,
    color: '#1a1614',
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 10,
    padding: '1px 6px',
    minWidth: 18,
    textAlign: 'center' as const,
  },

  // ── Email List ──
  emailListPanel: {
    flex: '0 0 340px',
    minWidth: 260,
    borderRight: `1px solid ${cssVars.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  listHeader: {
    padding: '8px 12px',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: cssVars.surfaceBase,
    border: `1px solid ${cssVars.borderSubtle}`,
    borderRadius: 6,
    padding: '5px 10px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: cssVars.textPrimary,
    fontSize: 12,
    fontFamily: 'inherit',
  },
  emailList: {
    flex: 1,
    overflowY: 'auto' as const,
  },
  emailRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    transition: 'background 0.12s',
    position: 'relative' as const,
  },
  emailRowSelected: {
    background: 'rgba(212,165,116,0.15)',
  },
  emailRowUnread: {
    fontWeight: 600,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: cssVars.colorAccent,
    flexShrink: 0,
    marginTop: 6,
  },
  readDotPlaceholder: {
    width: 7,
    flexShrink: 0,
  },
  starBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
    color: cssVars.textPrimary,
    opacity: 0.5,
  },
  starBtnActive: {
    opacity: 1,
    color: '#f5c842',
  },
  emailMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  emailMetaTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  emailFrom: {
    fontSize: 13,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  emailDate: {
    fontSize: 11,
    opacity: 0.6,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  emailSubject: {
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emailPreview: {
    fontSize: 11,
    opacity: 0.55,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // ── Reader Panel ──
  readerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  readerToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    flexWrap: 'wrap' as const,
  },
  toolbarBtn: {
    background: 'transparent',
    border: `1px solid ${cssVars.borderSubtle}`,
    color: cssVars.textPrimary,
    borderRadius: 5,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.12s, border-color 0.12s',
  },
  toolbarSeparator: {
    width: 1,
    height: 20,
    background: cssVars.borderSubtle,
    margin: '0 4px',
    flexShrink: 0,
  },
  readerEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
    fontSize: 14,
    flexDirection: 'column',
    gap: 8,
  },
  readerContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px 24px',
  },
  readerSubject: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    lineHeight: 1.3,
  },
  readerMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    fontSize: 12,
  },
  readerMetaRow: {
    display: 'flex',
    gap: 8,
  },
  readerMetaLabel: {
    opacity: 0.5,
    minWidth: 36,
    flexShrink: 0,
  },
  readerMetaValue: {
    wordBreak: 'break-all' as const,
  },
  readerBody: {
    fontSize: 13,
    lineHeight: 1.65,
  },
  attachmentList: {
    marginTop: 20,
    paddingTop: 14,
    borderTop: `1px solid ${cssVars.borderSubtle}`,
  },
  attachmentItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: cssVars.surfaceElevated,
    border: `1px solid ${cssVars.borderSubtle}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    marginRight: 6,
    marginBottom: 6,
  },

  // ── Compose Modal ──
  composeOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    zIndex: 100,
    padding: 16,
  },
  composeModal: {
    width: '100%',
    maxWidth: 560,
    background: cssVars.surfaceElevated,
    borderRadius: 10,
    border: `1px solid ${cssVars.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    maxHeight: '85%',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  composeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
    background: cssVars.surfaceBase,
  },
  composeTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  composeClose: {
    background: 'none',
    border: 'none',
    color: cssVars.textPrimary,
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 4px',
    opacity: 0.6,
    lineHeight: 1,
  },
  composeField: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderBottom: `1px solid ${cssVars.borderSubtle}`,
  },
  composeLabel: {
    fontSize: 12,
    opacity: 0.55,
    minWidth: 32,
    flexShrink: 0,
  },
  composeInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: cssVars.textPrimary,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  composeBody: {
    flex: 1,
    minHeight: 180,
    padding: 14,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: cssVars.textPrimary,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'none' as const,
    lineHeight: 1.6,
  },
  composeFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderTop: `1px solid ${cssVars.borderSubtle}`,
  },
  sendBtn: {
    padding: '7px 20px',
    background: cssVars.colorAccent,
    color: '#1a1614',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  discardBtn: {
    padding: '7px 14px',
    background: 'transparent',
    border: `1px solid ${cssVars.borderSubtle}`,
    color: cssVars.textPrimary,
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  ccToggle: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: cssVars.colorAccent,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
  emptyList: {
    padding: 32,
    textAlign: 'center' as const,
    opacity: 0.4,
    fontSize: 13,
  },
  sidebarToggle: {
    background: 'none',
    border: 'none',
    color: cssVars.textPrimary,
    cursor: 'pointer',
    fontSize: 16,
    padding: '4px',
    opacity: 0.6,
    lineHeight: 1,
    flexShrink: 0,
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function ToolbarButton({ label, icon, onClick, disabled, danger }: ToolbarButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...styles.toolbarBtn,
        opacity: disabled ? 0.35 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        ...(hovered && !disabled
          ? { background: danger ? 'rgba(220,80,80,0.15)' : 'rgba(212,165,116,0.12)' }
          : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EmailApp({ emails: initialEmails, folders: initialFolders, onSend, onChange }: EmailAppProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalEmails = useRef<string>(JSON.stringify(initialEmails));

  const [emails, setEmails] = useState<EmailMessage[]>(initialEmails ?? DEFAULT_EMAILS);
  const [activeFolder, setActiveFolder] = useState('Inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'forward'>('new');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCc, setShowCc] = useState(false);

  // Compose fields
  const [draftTo, setDraftTo] = useState('');
  const [draftCc, setDraftCc] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify(initialEmails);
    if (serialized === lastExternalEmails.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalEmails.current = serialized;
    if (initialEmails) setEmails(initialEmails);
  }, [initialEmails]);

  // Auto-collapse sidebar on narrow width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w < 640 && !sidebarCollapsed) setSidebarCollapsed(true);
        if (w >= 640 && sidebarCollapsed) setSidebarCollapsed(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Run once on mount; sidebar can still be toggled manually
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived data ──

  const folderData = useMemo<FolderData[]>(() => {
    if (initialFolders) return initialFolders;
    // Recompute unread counts from emails
    return DEFAULT_FOLDERS.map((f) => ({
      ...f,
      unreadCount: emails.filter((e) => e.folder === f.name && !e.read).length || undefined,
    }));
  }, [initialFolders, emails]);

  const filteredEmails = useMemo(() => {
    let list = emails.filter((e) => {
      if (activeFolder === 'Starred') return e.starred;
      return e.folder === activeFolder;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.from.toLowerCase().includes(q) ||
          e.body.replace(/<[^>]*>/g, '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [emails, activeFolder, searchQuery]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId) ?? null,
    [emails, selectedEmailId]
  );

  // ── Mutations ──

  const updateEmails = useCallback(
    (updater: (prev: EmailMessage[]) => EmailMessage[]) => {
      isInternalEdit.current = true;
      setEmails((prev) => {
        const next = updater(prev);
        onChange?.(next);
        return next;
      });
    },
    [onChange]
  );

  const markRead = useCallback(
    (id: string) => {
      updateEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)));
    },
    [updateEmails]
  );

  const toggleStar = useCallback(
    (id: string, ev?: React.MouseEvent) => {
      ev?.stopPropagation();
      updateEmails((prev) => prev.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)));
    },
    [updateEmails]
  );

  const toggleReadStatus = useCallback(
    (id: string) => {
      updateEmails((prev) => prev.map((e) => (e.id === id ? { ...e, read: !e.read } : e)));
    },
    [updateEmails]
  );

  const moveToFolder = useCallback(
    (id: string, folder: string) => {
      updateEmails((prev) => prev.map((e) => (e.id === id ? { ...e, folder } : e)));
      if (selectedEmailId === id) setSelectedEmailId(null);
    },
    [updateEmails, selectedEmailId]
  );

  const deleteEmail = useCallback(
    (id: string) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      if (email.folder === 'Trash') {
        // Permanently delete
        updateEmails((prev) => prev.filter((e) => e.id !== id));
      } else {
        moveToFolder(id, 'Trash');
      }
      if (selectedEmailId === id) setSelectedEmailId(null);
    },
    [emails, updateEmails, moveToFolder, selectedEmailId]
  );

  const archiveEmail = useCallback(
    (id: string) => moveToFolder(id, 'Archive'),
    [moveToFolder]
  );

  // ── Select email ──

  const selectEmail = useCallback(
    (id: string) => {
      setSelectedEmailId(id);
      markRead(id);
    },
    [markRead]
  );

  // ── Compose ──

  const resetCompose = useCallback(() => {
    setDraftTo('');
    setDraftCc('');
    setDraftSubject('');
    setDraftBody('');
    setShowCc(false);
    setComposing(false);
    setComposeMode('new');
  }, []);

  const openCompose = useCallback(() => {
    resetCompose();
    setComposing(true);
    setComposeMode('new');
  }, [resetCompose]);

  const openReply = useCallback(() => {
    if (!selectedEmail) return;
    setDraftTo(selectedEmail.from);
    setDraftCc('');
    setDraftSubject(`Re: ${selectedEmail.subject.replace(/^Re:\s*/i, '')}`);
    setDraftBody('');
    setShowCc(false);
    setComposing(true);
    setComposeMode('reply');
  }, [selectedEmail]);

  const openForward = useCallback(() => {
    if (!selectedEmail) return;
    setDraftTo('');
    setDraftCc('');
    setDraftSubject(`Fwd: ${selectedEmail.subject.replace(/^Fwd:\s*/i, '')}`);
    setDraftBody(
      `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmail.from}\nDate: ${formatFullDate(selectedEmail.date)}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.body.replace(/<[^>]*>/g, '')}`
    );
    setShowCc(false);
    setComposing(true);
    setComposeMode('forward');
  }, [selectedEmail]);

  const handleSend = useCallback(() => {
    const toList = draftTo
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (toList.length === 0 || !draftSubject.trim()) return;

    const ccList = draftCc
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const draft: EmailDraft = {
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      subject: draftSubject,
      body: draftBody,
    };

    onSend?.(draft);

    // Add to sent
    const newEmail: EmailMessage = {
      id: generateId(),
      from: 'you@luna.dev',
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      subject: draftSubject,
      body: draftBody.replace(/\n/g, '<br/>'),
      date: new Date().toISOString(),
      read: true,
      starred: false,
      folder: 'Sent',
    };

    updateEmails((prev) => [newEmail, ...prev]);
    resetCompose();
  }, [draftTo, draftCc, draftSubject, draftBody, onSend, updateEmails, resetCompose]);

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only if our container or its descendants are focused
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;

      if (e.key === 'Escape' && composing) {
        e.preventDefault();
        resetCompose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [composing, resetCompose]);

  // ── Render ──

  return (
    <div ref={containerRef} style={styles.container}>
      {/* ── Sidebar ── */}
      <div
        style={{
          ...styles.sidebar,
          ...(sidebarCollapsed ? styles.sidebarCollapsed : {}),
        }}
      >
        <div style={styles.sidebarHeader}>
          {sidebarCollapsed ? (
            <button
              style={{ ...styles.composeBtn, ...styles.composeBtnCollapsed }}
              onClick={openCompose}
              title="Compose"
            >
              ✎
            </button>
          ) : (
            <button style={styles.composeBtn} onClick={openCompose}>
              <span>✎</span>
              <span>Compose</span>
            </button>
          )}
          <button
            style={styles.sidebarToggle}
            onClick={() => setSidebarCollapsed((p) => !p)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '▸' : '◂'}
          </button>
        </div>
        <div style={styles.folderList}>
          {folderData.map((folder) => (
            <div
              key={folder.name}
              style={{
                ...styles.folderItem,
                ...(activeFolder === folder.name ? styles.folderItemActive : {}),
              }}
              onClick={() => {
                setActiveFolder(folder.name);
                setSelectedEmailId(null);
                setSearchQuery('');
              }}
              onMouseEnter={(e) => {
                if (activeFolder !== folder.name) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(212,165,116,0.07)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeFolder !== folder.name) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }
              }}
            >
              <span style={styles.folderIcon}>{folder.icon}</span>
              {!sidebarCollapsed && (
                <>
                  <span style={styles.folderName}>{folder.name}</span>
                  {folder.unreadCount && folder.unreadCount > 0 && (
                    <span style={styles.folderBadge}>{folder.unreadCount}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Email List Panel ── */}
      <div style={styles.emailListPanel}>
        <div style={styles.listHeader}>
          <div style={styles.listTitle}>
            {activeFolder}
            {filteredEmails.length > 0 && (
              <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 400 }}>
                ({filteredEmails.length})
              </span>
            )}
          </div>
          <div style={styles.searchBox}>
            <span style={{ opacity: 0.5, fontSize: 13 }}>🔍</span>
            <input
              style={styles.searchInput}
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: cssVars.textPrimary,
                  cursor: 'pointer',
                  fontSize: 14,
                  opacity: 0.5,
                  padding: 0,
                  lineHeight: 1,
                }}
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={styles.emailList}>
          {filteredEmails.length === 0 ? (
            <div style={styles.emptyList}>
              {searchQuery ? 'No emails match your search.' : 'No emails in this folder.'}
            </div>
          ) : (
            filteredEmails.map((email) => (
              <div
                key={email.id}
                style={{
                  ...styles.emailRow,
                  ...(selectedEmailId === email.id ? styles.emailRowSelected : {}),
                  ...(email.read ? {} : styles.emailRowUnread),
                }}
                onClick={() => selectEmail(email.id)}
                onMouseEnter={(e) => {
                  if (selectedEmailId !== email.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(212,165,116,0.07)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedEmailId !== email.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }
                }}
              >
                {!email.read ? <div style={styles.unreadDot} /> : <div style={styles.readDotPlaceholder} />}
                <button
                  style={{
                    ...styles.starBtn,
                    ...(email.starred ? styles.starBtnActive : {}),
                  }}
                  onClick={(e) => toggleStar(email.id, e)}
                  title={email.starred ? 'Unstar' : 'Star'}
                >
                  {email.starred ? '★' : '☆'}
                </button>
                <div style={styles.emailMeta}>
                  <div style={styles.emailMetaTop}>
                    <span
                      style={{
                        ...styles.emailFrom,
                        opacity: email.read ? 0.75 : 1,
                      }}
                    >
                      {email.from}
                    </span>
                    <span style={styles.emailDate}>{formatDate(email.date)}</span>
                  </div>
                  <div
                    style={{
                      ...styles.emailSubject,
                      opacity: email.read ? 0.75 : 1,
                    }}
                  >
                    {email.subject}
                  </div>
                  <div style={styles.emailPreview}>{truncate(email.body, 80)}</div>
                  {email.attachments && email.attachments.length > 0 && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                      📎 {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Reader Panel ── */}
      <div style={styles.readerPanel}>
        <div style={styles.readerToolbar}>
          <ToolbarButton icon="↩" label="Reply" onClick={openReply} disabled={!selectedEmail} />
          <ToolbarButton icon="↪" label="Forward" onClick={openForward} disabled={!selectedEmail} />
          <div style={styles.toolbarSeparator} />
          <ToolbarButton
            icon="📦"
            label="Archive"
            onClick={() => selectedEmail && archiveEmail(selectedEmail.id)}
            disabled={!selectedEmail}
          />
          <ToolbarButton
            icon="🗑"
            label="Delete"
            onClick={() => selectedEmail && deleteEmail(selectedEmail.id)}
            disabled={!selectedEmail}
            danger
          />
          <div style={styles.toolbarSeparator} />
          <ToolbarButton
            icon={selectedEmail?.read ? '●' : '○'}
            label={selectedEmail?.read ? 'Unread' : 'Read'}
            onClick={() => selectedEmail && toggleReadStatus(selectedEmail.id)}
            disabled={!selectedEmail}
          />
          <ToolbarButton
            icon={selectedEmail?.starred ? '★' : '☆'}
            label={selectedEmail?.starred ? 'Unstar' : 'Star'}
            onClick={() => selectedEmail && toggleStar(selectedEmail.id)}
            disabled={!selectedEmail}
          />
        </div>

        {!selectedEmail ? (
          <div style={styles.readerEmpty}>
            <span style={{ fontSize: 36, opacity: 0.3 }}>✉</span>
            <span>Select an email to read</span>
          </div>
        ) : (
          <div style={styles.readerContent}>
            <div style={styles.readerSubject}>{selectedEmail.subject}</div>
            <div style={styles.readerMeta}>
              <div style={styles.readerMetaRow}>
                <span style={styles.readerMetaLabel}>From</span>
                <span style={styles.readerMetaValue}>{selectedEmail.from}</span>
              </div>
              <div style={styles.readerMetaRow}>
                <span style={styles.readerMetaLabel}>To</span>
                <span style={styles.readerMetaValue}>{selectedEmail.to.join(', ')}</span>
              </div>
              {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                <div style={styles.readerMetaRow}>
                  <span style={styles.readerMetaLabel}>Cc</span>
                  <span style={styles.readerMetaValue}>{selectedEmail.cc.join(', ')}</span>
                </div>
              )}
              <div style={styles.readerMetaRow}>
                <span style={styles.readerMetaLabel}>Date</span>
                <span style={styles.readerMetaValue}>{formatFullDate(selectedEmail.date)}</span>
              </div>
            </div>
            <div
              style={styles.readerBody}
              dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
            />
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div style={styles.attachmentList}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  Attachments ({selectedEmail.attachments.length})
                </div>
                {selectedEmail.attachments.map((att, i) => (
                  <div key={i} style={styles.attachmentItem}>
                    <span>📎</span>
                    <span>{att.name}</span>
                    <span style={{ opacity: 0.5 }}>({att.size})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Compose Modal ── */}
      {composing && (
        <div style={styles.composeOverlay} onClick={(e) => e.target === e.currentTarget && resetCompose()}>
          <div style={styles.composeModal}>
            <div style={styles.composeHeader}>
              <span style={styles.composeTitle}>
                {composeMode === 'reply' ? 'Reply' : composeMode === 'forward' ? 'Forward' : 'New Message'}
              </span>
              <button style={styles.composeClose} onClick={resetCompose} title="Close">
                ✕
              </button>
            </div>
            <div style={styles.composeField}>
              <span style={styles.composeLabel}>To</span>
              <input
                style={styles.composeInput}
                placeholder="recipient@example.com"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                autoFocus
              />
              {!showCc && (
                <button style={styles.ccToggle} onClick={() => setShowCc(true)}>
                  Cc
                </button>
              )}
            </div>
            {showCc && (
              <div style={styles.composeField}>
                <span style={styles.composeLabel}>Cc</span>
                <input
                  style={styles.composeInput}
                  placeholder="cc@example.com"
                  value={draftCc}
                  onChange={(e) => setDraftCc(e.target.value)}
                />
              </div>
            )}
            <div style={styles.composeField}>
              <span style={styles.composeLabel}>Subj</span>
              <input
                style={styles.composeInput}
                placeholder="Subject"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
              />
            </div>
            <textarea
              style={styles.composeBody}
              placeholder="Write your message..."
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
            />
            <div style={styles.composeFooter}>
              <button
                style={{
                  ...styles.sendBtn,
                  opacity: draftTo.trim() && draftSubject.trim() ? 1 : 0.5,
                  cursor: draftTo.trim() && draftSubject.trim() ? 'pointer' : 'not-allowed',
                }}
                onClick={handleSend}
                disabled={!draftTo.trim() || !draftSubject.trim()}
              >
                Send
              </button>
              <button style={styles.discardBtn} onClick={resetCompose}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailApp;
