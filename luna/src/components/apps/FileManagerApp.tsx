import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FileEntry {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  path: string;
  icon?: string;
}

interface FileManagerProps {
  files?: FileEntry[];
  currentPath?: string;
  viewMode?: 'grid' | 'list';
  onChange?: (files: FileEntry[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_FILES: FileEntry[] = [
  { id: '1', name: 'Documents', type: 'folder', path: '/Documents', modified: '2026-03-20' },
  { id: '2', name: 'Photos', type: 'folder', path: '/Photos', modified: '2026-03-18' },
  { id: '3', name: 'Music', type: 'folder', path: '/Music', modified: '2026-03-15' },
  { id: '4', name: 'report.pdf', type: 'file', size: 245000, path: '/report.pdf', modified: '2026-03-25' },
  { id: '5', name: 'avatar.png', type: 'file', size: 89000, path: '/avatar.png', modified: '2026-03-22' },
  { id: '6', name: 'notes.txt', type: 'file', size: 1200, path: '/notes.txt', modified: '2026-03-26' },
  { id: '7', name: 'budget.xlsx', type: 'file', size: 54000, path: '/budget.xlsx', modified: '2026-03-24' },
  { id: '8', name: 'demo.mp4', type: 'file', size: 12400000, path: '/demo.mp4', modified: '2026-03-21' },
  { id: '9', name: 'playlist.mp3', type: 'file', size: 4500000, path: '/playlist.mp3', modified: '2026-03-19' },
];

const SIDEBAR_FOLDERS = ['Home', 'Desktop', 'Documents', 'Downloads', 'Photos', 'Music', 'Trash'];

function iconForFile(entry: FileEntry): string {
  if (entry.icon) return entry.icon;
  if (entry.type === 'folder') return '\ud83d\udcc1';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '\ud83d\uddbc\ufe0f';
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return '\ud83c\udfb5';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '\ud83c\udfac';
  if (['xlsx', 'csv', 'xls'].includes(ext)) return '\ud83d\udcca';
  if (['pdf'].includes(ext)) return '\ud83d\udcc4';
  return '\ud83d\udcc4';
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type SortKey = 'name' | 'date' | 'size' | 'type';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    ...GLASS.elevated,
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
  toolBtn: {
    ...GLASS.ghostBtn,
    padding: '5px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    whiteSpace: 'nowrap' as const,
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    background: 'transparent',
    flexShrink: 0,
  },
  crumbLink: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-primary)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    padding: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 170,
    flexShrink: 0,
    borderRight: `1px solid ${GLASS.dividerColor}`,
    overflowY: 'auto' as const,
    padding: '8px 0',
    ...GLASS.elevated,
  },
  sideItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text-secondary)',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: 'var(--font-ui)',
  },
  sideItemActive: {
    background: GLASS.selectedBg,
    color: 'var(--accent-primary)',
  },
  main: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 8,
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'center' as const,
    userSelect: 'none' as const,
    border: '1px solid transparent',
    ...GLASS.surface,
    background: 'transparent',
  },
  gridItemSelected: {
    background: GLASS.selectedBg,
    border: `1px solid ${GLASS.selectedBorder}`,
  },
  gridIcon: { fontSize: 32 },
  gridName: { fontSize: 11, wordBreak: 'break-word' as const, lineHeight: 1.3 },
  listRow: {
    display: 'grid',
    gridTemplateColumns: '24px 1fr 90px 90px 70px',
    gap: 8,
    alignItems: 'center',
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    userSelect: 'none' as const,
    border: '1px solid transparent',
  },
  listRowSelected: {
    background: GLASS.selectedBg,
    border: `1px solid ${GLASS.selectedBorder}`,
  },
  listHeader: {
    display: 'grid',
    gridTemplateColumns: '24px 1fr 90px 90px 70px',
    gap: 8,
    padding: '4px 8px',
    fontSize: 11,
    color: 'var(--text-tertiary)',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    marginBottom: 4,
    userSelect: 'none' as const,
  },
  sortBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    padding: 0,
    textAlign: 'left' as const,
  },
  detailPanel: {
    width: 200,
    flexShrink: 0,
    borderLeft: `1px solid ${GLASS.dividerColor}`,
    padding: 14,
    overflowY: 'auto' as const,
    ...GLASS.elevated,
  },
  detailTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  detailRow: { marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' },
  detailLabel: { color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 },
  ctxMenu: {
    position: 'fixed' as const,
    ...GLASS.elevated,
    borderRadius: 8,
    padding: '4px 0',
    zIndex: 9999,
    minWidth: 160,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  ctxItem: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    padding: '7px 14px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileManagerApp({
  files: filesProp,
  currentPath: pathProp = '/',
  viewMode: modeProp = 'grid',
  onChange,
}: FileManagerProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalFiles = useRef<string>(JSON.stringify(filesProp));

  const [files, setFiles] = useState<FileEntry[]>(filesProp ?? DEFAULT_FILES);
  const [cwd, setCwd] = useState(pathProp);
  const [view, setView] = useState<'grid' | 'list'>(modeProp);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify(filesProp);
    if (serialized === lastExternalFiles.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalFiles.current = serialized;
    if (filesProp) setFiles(filesProp);
  }, [filesProp]);

  // Sync currentPath prop
  useEffect(() => {
    if (pathProp !== undefined) {
      setCwd(pathProp);
    }
  }, [pathProp]);

  // Sync viewMode prop
  useEffect(() => {
    if (modeProp !== undefined) {
      setView(modeProp);
    }
  }, [modeProp]);

  const commit = useCallback((next: FileEntry[]) => {
    isInternalEdit.current = true;
    setFiles(next);
    onChange?.(next);
  }, [onChange]);

  // Derived: visible files
  const visible = useMemo(() => {
    let list = files.filter(f => {
      const parent = f.path.substring(0, f.path.lastIndexOf('/')) || '/';
      return parent === cwd || (cwd === '/' && !f.path.slice(1).includes('/'));
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      // folders first
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'date') cmp = (a.modified ?? '').localeCompare(b.modified ?? '');
      else if (sortKey === 'size') cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortKey === 'type') cmp = a.name.split('.').pop()!.localeCompare(b.name.split('.').pop()!);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [files, cwd, search, sortKey, sortAsc]);

  // Breadcrumbs
  const crumbs = useMemo(() => {
    const parts = cwd.split('/').filter(Boolean);
    const paths: { label: string; path: string }[] = [{ label: 'Home', path: '/' }];
    parts.forEach((p, i) => paths.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') }));
    return paths;
  }, [cwd]);

  // Selected file details
  const detailFile = useMemo(() => files.find(f => f.id === selected) ?? null, [files, selected]);

  // Context menu close
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [ctxMenu]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleOpen = (entry: FileEntry) => {
    if (entry.type === 'folder') {
      setCwd(entry.path);
      setSelected(null);
    } else {
      setSelected(entry.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, fileId: id });
  };

  const handleDelete = () => {
    if (!ctxMenu) return;
    commit(files.filter(f => f.id !== ctxMenu.fileId));
    if (selected === ctxMenu.fileId) setSelected(null);
    setCtxMenu(null);
  };

  const handleRenameStart = () => {
    if (!ctxMenu) return;
    const f = files.find(f => f.id === ctxMenu.fileId);
    if (f) { setRenaming(f.id); setRenameVal(f.name); }
    setCtxMenu(null);
  };

  const handleRenameCommit = () => {
    if (!renaming || !renameVal.trim()) { setRenaming(null); return; }
    commit(files.map(f => f.id === renaming ? { ...f, name: renameVal.trim() } : f));
    setRenaming(null);
  };

  const handleNewFolder = () => {
    const name = 'New Folder';
    const path = cwd === '/' ? `/${name}` : `${cwd}/${name}`;
    const entry: FileEntry = { id: uid(), name, type: 'folder', path, modified: new Date().toISOString().slice(0, 10) };
    commit([...files, entry]);
  };

  /* ---- Render ---- */

  const renderGridItem = (f: FileEntry) => {
    const isSelected = selected === f.id;
    const isRenaming = renaming === f.id;
    return (
      <div
        key={f.id}
        style={{ ...S.gridItem, ...(isSelected ? S.gridItemSelected : {}) }}
        onClick={() => setSelected(f.id)}
        onDoubleClick={() => handleOpen(f)}
        onContextMenu={e => handleContextMenu(e, f.id)}
      >
        <span style={S.gridIcon}>{iconForFile(f)}</span>
        {isRenaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setRenaming(null); }}
            style={{ ...S.searchInput, width: '100%', fontSize: 11, padding: '2px 4px', textAlign: 'center' }}
          />
        ) : (
          <span style={S.gridName}>{f.name}</span>
        )}
      </div>
    );
  };

  const renderListItem = (f: FileEntry) => {
    const isSelected = selected === f.id;
    const isRenaming = renaming === f.id;
    return (
      <div
        key={f.id}
        style={{ ...S.listRow, ...(isSelected ? S.listRowSelected : {}) }}
        onClick={() => setSelected(f.id)}
        onDoubleClick={() => handleOpen(f)}
        onContextMenu={e => handleContextMenu(e, f.id)}
      >
        <span>{iconForFile(f)}</span>
        {isRenaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameCommit(); if (e.key === 'Escape') setRenaming(null); }}
            style={{ ...S.searchInput, fontSize: 13, padding: '2px 6px' }}
          />
        ) : (
          <span>{f.name}</span>
        )}
        <span style={{ color: 'var(--text-tertiary)' }}>{f.modified ?? '--'}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{formatSize(f.size)}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{f.type}</span>
      </div>
    );
  };

  return (
    <div style={S.root} ref={rootRef}>
      {/* Toolbar */}
      <div style={S.toolbar}>
        <input
          style={S.searchInput}
          placeholder="Search files\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button style={S.toolBtn} onClick={handleNewFolder}>+ Folder</button>
        <button style={S.toolBtn} title="Upload">Upload</button>
        <button
          style={{ ...S.toolBtn, color: view === 'grid' ? 'var(--accent-primary)' : undefined }}
          onClick={() => setView('grid')}
        >
          Grid
        </button>
        <button
          style={{ ...S.toolBtn, color: view === 'list' ? 'var(--accent-primary)' : undefined }}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>

      {/* Breadcrumbs */}
      <div style={S.breadcrumbs}>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.path}>
            {i > 0 && <span style={{ margin: '0 2px' }}>/</span>}
            <button style={S.crumbLink} onClick={() => { setCwd(c.path); setSelected(null); }}>{c.label}</button>
          </React.Fragment>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          {SIDEBAR_FOLDERS.map(f => (
            <button
              key={f}
              style={{ ...S.sideItem, ...(cwd === '/' + f || (f === 'Home' && cwd === '/') ? S.sideItemActive : {}) }}
              onClick={() => { setCwd(f === 'Home' ? '/' : '/' + f); setSelected(null); }}
            >
              {f === 'Trash' ? '\ud83d\uddd1\ufe0f' : '\ud83d\udcc1'} {f}
            </button>
          ))}
        </div>

        {/* Main */}
        <div style={S.main}>
          {view === 'list' && (
            <div style={S.listHeader}>
              <span />
              <button style={S.sortBtn} onClick={() => handleSort('name')}>Name {sortKey === 'name' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('date')}>Modified {sortKey === 'date' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('size')}>Size {sortKey === 'size' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('type')}>Type {sortKey === 'type' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
            </div>
          )}
          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              {search ? 'No matching files' : 'This folder is empty'}
            </div>
          )}
          {view === 'grid' ? (
            <div style={S.grid}>{visible.map(renderGridItem)}</div>
          ) : (
            <div>{visible.map(renderListItem)}</div>
          )}
        </div>

        {/* Detail Panel */}
        {detailFile && (
          <div style={S.detailPanel}>
            <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 12 }}>{iconForFile(detailFile)}</div>
            <div style={S.detailTitle}>{detailFile.name}</div>
            <div style={S.detailRow}><span style={S.detailLabel}>Type</span>{detailFile.type}</div>
            <div style={S.detailRow}><span style={S.detailLabel}>Size</span>{formatSize(detailFile.size)}</div>
            <div style={S.detailRow}><span style={S.detailLabel}>Modified</span>{detailFile.modified ?? '--'}</div>
            <div style={S.detailRow}><span style={S.detailLabel}>Path</span>{detailFile.path}</div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <div style={{ ...S.ctxMenu, top: ctxMenu.y, left: ctxMenu.x }}>
          <button style={S.ctxItem} onClick={() => { const f = files.find(f => f.id === ctxMenu.fileId); if (f) handleOpen(f); setCtxMenu(null); }}
            onMouseEnter={e => (e.currentTarget.style.background = GLASS.hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >Open</button>
          <button style={S.ctxItem} onClick={handleRenameStart}
            onMouseEnter={e => (e.currentTarget.style.background = GLASS.hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >Rename</button>
          <button style={S.ctxItem} onClick={handleDelete}
            onMouseEnter={e => (e.currentTarget.style.background = GLASS.hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >Delete</button>
          <button style={S.ctxItem}
            onMouseEnter={e => (e.currentTarget.style.background = GLASS.hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => setCtxMenu(null)}
          >Move</button>
        </div>
      )}
    </div>
  );
}

export default FileManagerApp;
