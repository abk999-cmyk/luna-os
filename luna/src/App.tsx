import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Desktop } from './components/Desktop';
import { PermissionDialog } from './components/PermissionDialog';
import { useWindowStore } from './stores/windowStore';
import { useAgentStore } from './stores/agentStore';
import { getAgentStatus } from './ipc/agent';

import './styles/theme.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/windows.css';
import './styles/input-bar.css';
import './styles/sprint2.css';

interface PermissionRequest {
  action_id: string;
  agent_id: string;
  agent_type?: string;
  action_type: string;
  payload_preview?: string;
}

function App() {
  const loadWindows = useWindowStore((s) => s.loadWindows);
  const addWindow = useWindowStore((s) => s.addWindow);
  const setWindowContent = useWindowStore((s) => s.setWindowContent);
  const setHasConductor = useAgentStore((s) => s.setHasConductor);
  const setStatus = useAgentStore((s) => s.setStatus);

  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    // Load saved windows from backend
    loadWindows();

    // Check agent status
    getAgentStatus().then((status) => {
      setHasConductor(status.has_conductor);
    });

    // ── Agent response ───────────────────────────────────────────────────────
    const unlistenResponse = listen<{ text?: string }>('agent-response', async (event) => {
      const text = event.payload?.text || 'No response';
      setStatus('idle');

      const windows = useWindowStore.getState().windows;
      const existingResponse = windows.find(
        (w) => w.content_type === 'response' && w.focused
      );

      if (existingResponse) {
        const existing = useWindowStore.getState().windowContent.get(existingResponse.id) || '';
        setWindowContent(existingResponse.id, existing ? existing + '\n\n---\n\n' + text : text);
      } else {
        await addWindow('Response', 'response', text);
      }
    });

    // ── Agent window creation ────────────────────────────────────────────────
    const unlistenWindowCreate = listen<{ title?: string; content_type?: string }>(
      'agent-window-create',
      async (event) => {
        const title = event.payload?.title || 'New Window';
        const contentType = event.payload?.content_type || 'panel';
        await addWindow(title, contentType);
      }
    );

    // ── Window content update (Sprint 2) ─────────────────────────────────────
    const unlistenContentUpdate = listen<{ window_id?: string; content?: string }>(
      'window-content-update',
      (event) => {
        const { window_id, content } = event.payload;
        if (window_id && content !== undefined) {
          setWindowContent(window_id, content);
        }
      }
    );

    // ── System notifications (Sprint 2) ──────────────────────────────────────
    const unlistenNotify = listen<{ message?: string; level?: string }>(
      'system-notification',
      (event) => {
        // For now just log — Phase 3 will add a proper toast/notification UI
        console.log('[Luna]', event.payload.level || 'info', ':', event.payload.message);
      }
    );

    // ── Permission requests (Sprint 2) ────────────────────────────────────────
    const unlistenPermission = listen<PermissionRequest>(
      'permission-request',
      (event) => {
        setPendingPermission(event.payload);
      }
    );

    return () => {
      unlistenResponse.then((fn) => fn());
      unlistenWindowCreate.then((fn) => fn());
      unlistenContentUpdate.then((fn) => fn());
      unlistenNotify.then((fn) => fn());
      unlistenPermission.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <Desktop />
      {pendingPermission && (
        <PermissionDialog
          request={pendingPermission}
          onResolved={() => setPendingPermission(null)}
        />
      )}
    </>
  );
}

export default App;
