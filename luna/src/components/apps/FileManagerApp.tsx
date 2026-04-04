import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GLASS } from './glassStyles';
import { listDirectory, getHomeDir } from '../../ipc/filesystem';
import type { FsEntry } from '../../ipc/filesystem';

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

function iconForFile(entry: FileEntry): string {
  if (entry.icon) return entry.icon;
  if (entry.type === 'folder') return '\ud83d\udcc1';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '\ud83d\uddbc\ufe0f';
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return '\ud83c\udfb5';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '\ud83c\udfac';
  if (['xlsx', 'csv', 'xls'].includes(ext)) return '\ud83d\udcca';
  if (['pdf'].includes(ext)) return '\ud83d\udcc4';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h'].includes(ext)) return '\ud83d\udcdd';
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return '\u2699\ufe0f';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return '\ud83d\udce6';
  if (['dmg', 'pkg', 'app'].includes(ext)) return '\ud83d\udcbe';
  return '\ud83d\udcc4';
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

type SortKey = 'name' | 'date' | 'size' | 'type';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const isTextFile = (name: string) => /\.(txt|md|json|js|ts|tsx|jsx|css|html|py|rs|toml|yaml|yml|xml|csv|log|sh|env)$/i.test(name);
const isImageFile = (name: string) => /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(name);
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Convert FsEntry from IPC to our FileEntry */
function fsToFileEntry(fs: FsEntry): FileEntry {
  return {
    id: fs.path, // use path as unique id
    name: fs.name,
    type: fs.is_dir ? 'folder' : 'file',
    size: fs.is_dir ? undefined : fs.size,
    modified: fs.modified || undefined,
    path: fs.path,
  };
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
    overflow: 'hidden',
  },
  crumbLink: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-primary)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    padding: 0,
    whiteSpace: 'nowrap' as const,
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
    gridTemplateColumns: '24px 1fr 120px 90px 70px',
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
    gridTemplateColumns: '24px 1fr 120px 90px 70px',
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
  loadingOverlay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    color: 'var(--text-tertiary)',
    fontSize: 13,
  },
};

/* ------------------------------------------------------------------ */
/*  Sidebar folders (now mapped to real paths)                         */
/* ------------------------------------------------------------------ */

interface SidebarEntry {
  label: string;
  icon: string;
  /** Will be resolved after we get homeDir */
  pathSuffix: string;
}

const SIDEBAR_ENTRIES: SidebarEntry[] = [
  { label: 'Home', icon: '\ud83c\udfe0', pathSuffix: '' },
  { label: 'Desktop', icon: '\ud83d\udcbb', pathSuffix: '/Desktop' },
  { label: 'Documents', icon: '\ud83d\udcc1', pathSuffix: '/Documents' },
  { label: 'Downloads', icon: '\u2b07\ufe0f', pathSuffix: '/Downloads' },
  { label: 'Photos', icon: '\ud83d\uddbc\ufe0f', pathSuffix: '/Pictures' },
  { label: 'Music', icon: '\ud83c\udfb5', pathSuffix: '/Music' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileManagerApp({
  files: filesProp,
  currentPath: pathProp,
  viewMode: modeProp = 'grid',
  onChange,
}: FileManagerProps) {
  const [files, setFiles] = useState<FileEntry[]>(filesProp ?? DEFAULT_FILES);
  const [cwd, setCwd] = useState(pathProp ?? '/');
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>(modeProp);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* ---- Resolve home directory on mount ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await getHomeDir();
        if (cancelled) return;
        setHomeDir(home);
        // If no external path was provided, navigate to home
        if (!pathProp) {
          setCwd(home);
          await loadDirectory(home);
        }
      } catch {
        // IPC not available, stay with defaults
        setIsLive(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Load a real directory ---- */
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const entries = await listDirectory(path);
      const mapped: FileEntry[] = entries.map(fsToFileEntry);
      setFiles(mapped);
      setIsLive(true);
      onChange?.(mapped);
    } catch {
      // Fallback: keep current files or use defaults
      if (!isLive) {
        setFiles(DEFAULT_FILES);
      }
    } finally {
      setLoading(false);
    }
  }, [isLive, onChange]);

  /* ---- Navigate to a directory ---- */
  const navigateTo = useCallback(async (path: string) => {
    setCwd(path);
    setSelected(null);
    setSearch('');
    if (isLive || homeDir) {
      await loadDirectory(path);
    }
  }, [isLive, homeDir, loadDirectory]);

  // Filtered + sorted visible files
  const visible = useMemo(() => {
    let list = [...files];
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
      else if (sortKey === 'type') cmp = (a.name.split('.').pop() ?? '').localeCompare(b.name.split('.').pop() ?? '');
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [files, search, sortKey, sortAsc]);

  // Breadcrumbs
  const crumbs = useMemo(() => {
    if (!isLive || !homeDir) {
      // Fallback breadcrumbs
      const parts = cwd.split('/').filter(Boolean);
      const paths: { label: string; path: string }[] = [{ label: 'Home', path: '/' }];
      parts.forEach((p, i) => paths.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') }));
      return paths;
    }

    // Real filesystem breadcrumbs
    const result: { label: string; path: string }[] = [];
    // Show home as root if cwd starts with homeDir
    if (cwd.startsWith(homeDir)) {
      result.push({ label: 'Home', path: homeDir });
      const rel = cwd.slice(homeDir.length);
      if (rel) {
        const parts = rel.split('/').filter(Boolean);
        parts.forEach((p, i) => {
          result.push({
            label: p,
            path: homeDir + '/' + parts.slice(0, i + 1).join('/'),
          });
        });
      }
    } else {
      // Outside home — show full path
      const parts = cwd.split('/').filter(Boolean);
      result.push({ label: '/', path: '/' });
      parts.forEach((p, i) => {
        result.push({ label: p, path: '/' + parts.slice(0, i + 1).join('/') });
      });
    }
    return result;
  }, [cwd, homeDir, isLive]);

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

  const handleOpen = async (entry: FileEntry) => {
    if (entry.type === 'folder') {
      await navigateTo(entry.path);
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
    const next = files.filter(f => f.id !== ctxMenu.fileId);
    setFiles(next);
    onChange?.(next);
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
    const next = files.map(f => f.id === renaming ? { ...f, name: renameVal.trim() } : f);
    setFiles(next);
    onChange?.(next);
    setRenaming(null);
  };

  const handleNewFolder = () => {
    const name = 'New Folder';
    const path = cwd === '/' ? `/${name}` : `${cwd}/${name}`;
    const entry: FileEntry = { id: uid(), name, type: 'folder', path, modified: new Date().toISOString().slice(0, 10) };
    const next = [...files, entry];
    setFiles(next);
    onChange?.(next);
  };

  const handleGoUp = async () => {
    if (!isLive) return;
    const parent = cwd.substring(0, cwd.lastIndexOf('/')) || '/';
    await navigateTo(parent);
  };

  /* ---- Sidebar navigation ---- */
  const handleSidebarClick = async (entry: SidebarEntry) => {
    if (homeDir) {
      const target = homeDir + entry.pathSuffix;
      await navigateTo(target);
    } else {
      // Fallback
      setCwd(entry.label === 'Home' ? '/' : '/' + entry.label);
    }
  };

  const isSidebarActive = (entry: SidebarEntry) => {
    if (homeDir) {
      return cwd === homeDir + entry.pathSuffix;
    }
    return cwd === '/' + entry.label || (entry.label === 'Home' && cwd === '/');
  };

  /* ---- Render ---- */

  const renderGridItem = (f: FileEntry) => {
    const isSelected = selected === f.id;
    const isRenaming = renaming === f.id;
    return (
      <div
        key={f.id}
        style={{ ...S.gridItem, ...(isSelected ? S.gridItemSelected : {}) }}
        onClick={() => { setSelected(f.id); setPreviewFile(f); }}
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
        onClick={() => { setSelected(f.id); setPreviewFile(f); }}
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
        <span style={{ color: 'var(--text-tertiary)' }}>{formatDate(f.modified)}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{formatSize(f.size)}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{f.type}</span>
      </div>
    );
  };

  return (
    <div style={S.root} ref={rootRef}>
      {/* Toolbar */}
      <div style={S.toolbar}>
        {isLive && (
          <button style={S.toolBtn} onClick={handleGoUp} title="Go up">
            \u2191
          </button>
        )}
        <input
          style={S.searchInput}
          placeholder="Search files\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button style={S.toolBtn} onClick={handleNewFolder}>+ Folder</button>
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
        {isLive && (
          <button
            style={S.toolBtn}
            onClick={() => loadDirectory(cwd)}
            title="Refresh"
          >
            \u21bb
          </button>
        )}
      </div>

      {/* Breadcrumbs */}
      <div style={S.breadcrumbs}>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.path}>
            {i > 0 && <span style={{ margin: '0 2px' }}>/</span>}
            <button style={S.crumbLink} onClick={() => navigateTo(c.path)}>{c.label}</button>
          </React.Fragment>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          {SIDEBAR_ENTRIES.map(entry => (
            <button
              key={entry.label}
              style={{ ...S.sideItem, ...(isSidebarActive(entry) ? S.sideItemActive : {}) }}
              onClick={() => handleSidebarClick(entry)}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div style={S.main}>
          {loading && (
            <div style={S.loadingOverlay}>Loading...</div>
          )}

          {!loading && view === 'list' && (
            <div style={S.listHeader}>
              <span />
              <button style={S.sortBtn} onClick={() => handleSort('name')}>Name {sortKey === 'name' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('date')}>Modified {sortKey === 'date' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('size')}>Size {sortKey === 'size' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
              <button style={S.sortBtn} onClick={() => handleSort('type')}>Type {sortKey === 'type' ? (sortAsc ? '\u25b2' : '\u25bc') : ''}</button>
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              {search ? 'No matching files' : 'This folder is empty'}
            </div>
          )}
          {!loading && view === 'grid' ? (
            <div style={S.grid}>{visible.map(renderGridItem)}</div>
          ) : !loading ? (
            <div>{visible.map(renderListItem)}</div>
          ) : null}
        </div>

        {/* Preview Panel */}
        {previewFile && (
          <div style={{
            width: 240, borderLeft: `1px solid ${GLASS.dividerColor}`, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewFile.name}</span>
              <button onClick={() => setPreviewFile(null)} style={{...GLASS.ghostBtn, padding: '2px 6px', fontSize: 12}} aria-label="Close preview">&#x2715;</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {previewFile.type === 'folder' ? 'Folder' : formatFileSize(previewFile.size || 0)}
            </div>
            {previewFile.modified && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Modified: {new Date(previewFile.modified).toLocaleDateString()}
              </div>
            )}
            {previewFile.type !== 'folder' && isImageFile(previewFile.name) && (
              <div style={{
                width: '100%', height: 120, borderRadius: 8,
                background: `linear-gradient(135deg, hsl(${previewFile.name.length * 37 % 360}, 50%, 30%), hsl(${previewFile.name.length * 71 % 360}, 50%, 20%))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'rgba(255,255,255,0.6)',
              }}>
                {previewFile.name.split('.').pop()?.toUpperCase()}
              </div>
            )}
            {previewFile.type !== 'folder' && isTextFile(previewFile.name) && (
              <div style={{...GLASS.inset, padding: 8, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                (Preview not available - file content requires filesystem read)
              </div>
            )}
            {previewFile.type !== 'folder' && !isTextFile(previewFile.name) && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                <div style={S.detailRow}><span style={S.detailLabel}>Type</span>{previewFile.type}</div>
                <div style={S.detailRow}><span style={S.detailLabel}>Path</span><span style={{ wordBreak: 'break-all', fontSize: 11 }}>{previewFile.path}</span></div>
              </div>
            )}
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
