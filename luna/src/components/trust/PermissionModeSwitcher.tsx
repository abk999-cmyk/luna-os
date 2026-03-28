import { useCallback } from 'react';
import { useShellStore } from '../../stores/shellStore';
import { setPermissionMode as ipcSetMode, type PermissionMode } from '../../ipc/permissions';
import { addToast } from '../primitives/Toast';

const MODES: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'supervised', label: 'Supervised', description: 'All actions require your approval' },
  { value: 'autonomous', label: 'Autonomous', description: 'Pre-approved actions run freely' },
  { value: 'custom', label: 'Custom', description: 'Per-action policy rules' },
];

export function PermissionModeSwitcher() {
  const mode = useShellStore((s) => s.permissionMode);
  const setMode = useShellStore((s) => s.setPermissionMode);

  const handleChange = useCallback(async (newMode: PermissionMode) => {
    if (newMode === mode) return;
    try {
      await ipcSetMode(newMode);
      setMode(newMode);
      addToast(`Permission mode: ${newMode}`, 'info');
    } catch (e) {
      console.error('Failed to set permission mode:', e);
      addToast('Failed to change mode', 'error');
    }
  }, [mode, setMode]);

  return (
    <div className="permission-mode-switcher">
      {MODES.map((m) => (
        <button
          key={m.value}
          className={`permission-mode-switcher__segment ${mode === m.value ? 'permission-mode-switcher__segment--active' : ''}`}
          onClick={() => handleChange(m.value)}
          title={m.description}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
