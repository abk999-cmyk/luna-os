import { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { WorkspaceCard } from './WorkspaceCard';

interface Preset {
  name: string;
  goal: string;
  icon: React.ReactNode;
}

const PRESETS: Preset[] = [
  {
    name: 'Research',
    goal: 'Investigate a topic, gather sources, synthesize findings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    name: 'Development',
    goal: 'Write, test, and debug code for a project',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    name: 'Writing',
    goal: 'Draft, edit, and polish written content',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
  },
  {
    name: 'Design',
    goal: 'Explore ideas, create mockups, plan visual systems',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="2.5" />
        <path d="M17.5 10.5 21 3" />
        <path d="M3 21l7.5-7.5" />
        <path d="M12.5 12.5 7 21" />
        <path d="M3 3l7.5 7.5" />
      </svg>
    ),
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WorkspaceBrowser({ open, onClose }: Props) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      loadWorkspaces();
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, loadWorkspaces]);

  const handlePresetClick = useCallback(async (preset: Preset) => {
    const ws = await createWorkspace(preset.name, preset.goal);
    await switchWorkspace(ws.id);
    onClose();
  }, [createWorkspace, switchWorkspace, onClose]);

  const handleWorkspaceClick = useCallback(async (id: string) => {
    if (id !== activeWorkspaceId) {
      await switchWorkspace(id);
    }
    onClose();
  }, [activeWorkspaceId, switchWorkspace, onClose]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkspace(id);
  }, [deleteWorkspace]);

  const handleNewWorkspace = useCallback(async () => {
    const ws = await createWorkspace('Untitled Workspace');
    await switchWorkspace(ws.id);
    onClose();
  }, [createWorkspace, switchWorkspace, onClose]);

  if (!open) return null;

  const filtered = workspaces.filter((w) =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="workspace-browser" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="workspace-browser__panel">
        <div className="workspace-browser__header">
          <span className="workspace-browser__title">Workspaces</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="topbar__btn" onClick={handleNewWorkspace} title="New workspace">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button className="topbar__btn" onClick={onClose} title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <input
          ref={searchRef}
          className="workspace-browser__search"
          type="text"
          placeholder="Search workspaces..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="workspace-browser__body">
          {/* Presets */}
          <div className="workspace-browser__section-title">Quick Start</div>
          <div className="workspace-browser__grid">
            {PRESETS.map((preset) => (
              <div
                key={preset.name}
                className="workspace-card"
                onClick={() => handlePresetClick(preset)}
              >
                <div className="workspace-card__preset-icon">{preset.icon}</div>
                <div className="workspace-card__name">{preset.name}</div>
                <div className="workspace-card__goal">{preset.goal}</div>
              </div>
            ))}
          </div>

          {/* Existing workspaces */}
          {filtered.length > 0 && (
            <>
              <div className="workspace-browser__section-title">Your Workspaces</div>
              <div className="workspace-browser__grid">
                {filtered.map((ws) => (
                  <WorkspaceCard
                    key={ws.id}
                    workspace={ws}
                    isActive={ws.id === activeWorkspaceId}
                    onClick={() => handleWorkspaceClick(ws.id)}
                    onDelete={() => handleDelete(ws.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
