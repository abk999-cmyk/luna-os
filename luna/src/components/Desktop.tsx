import { useWindowStore } from '../stores/windowStore';
import { useShellStore } from '../stores/shellStore';
import { Window } from './Window';
import { WindowConnector } from './WindowConnector';
import { TopBar } from './shell/TopBar';
import { Dock } from './shell/Dock';
import { HomeSurface } from './shell/HomeSurface';
import { WorkspaceBrowser } from './WorkspaceBrowser';
import { Sidebar } from './Sidebar';
import { MissionControl } from './MissionControl';
import { SnapZoneOverlay } from './SnapZoneOverlay';
import { useMagneticDrag } from '../hooks/useMagneticDrag';

export function Desktop() {
  const windows = useWindowStore((s) => s.windows);
  const unfocusAll = useWindowStore((s) => s.unfocusAll);
  const workspaceBrowserOpen = useShellStore((s) => s.workspaceBrowserOpen);
  const setWorkspaceBrowserOpen = useShellStore((s) => s.setWorkspaceBrowserOpen);
  const missionControlOpen = useShellStore((s) => s.missionControlOpen);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);

  // Get activeSnapZone from the shared magnetic drag hook
  const { activeSnapZone } = useMagneticDrag();

  const handleDesktopClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      unfocusAll();
    }
  };

  const sortedWindows = [...windows]
    .filter((w) => w.visibility !== 'hidden')
    .sort((a, b) => a.z_order - b.z_order);

  const visibleWindows = sortedWindows.filter((w) => w.visibility === 'visible');
  const hasVisibleWindows = visibleWindows.length > 0;

  const desktopBounds = {
    top: 32,
    left: 0,
    right: typeof window !== 'undefined' ? window.innerWidth : 1440,
    bottom: typeof window !== 'undefined' ? window.innerHeight - 56 : 900,
  };

  const sidebarWidth = sidebarCollapsed ? 48 : 304;

  return (
    <>
      <TopBar />

      <Sidebar />

      <div
        className="desktop"
        style={{
          position: 'fixed',
          top: 'var(--shell-topbar-height)',
          left: sidebarWidth,
          right: 0,
          bottom: 'var(--shell-dock-height)',
          background: 'var(--canvas-bg)',
          overflow: 'hidden',
          transition: 'left 0.2s ease',
        }}
        onClick={handleDesktopClick}
      >
        <WindowConnector />

        {!hasVisibleWindows && <HomeSurface />}

        {sortedWindows.map((win) => (
          <Window key={win.id} window={win} />
        ))}

        <SnapZoneOverlay activeZone={activeSnapZone} desktopBounds={desktopBounds} />
      </div>

      <Dock />

      {missionControlOpen && <MissionControl />}

      <WorkspaceBrowser
        open={workspaceBrowserOpen}
        onClose={() => setWorkspaceBrowserOpen(false)}
      />
    </>
  );
}
