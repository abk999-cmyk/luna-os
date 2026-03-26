import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Desktop } from './components/Desktop';
import { PermissionDialog } from './components/PermissionDialog';
import { AmbientBadge } from './components/AmbientBadge';
import { ToastContainer, addToast } from './components/primitives/Toast';
import { useWindowStore } from './stores/windowStore';
import { useAgentStore } from './stores/agentStore';
import { useAppStore } from './stores/appStore';
import { registerBuiltinComponents } from './renderer/ComponentRegistry';
import { initSyncManager } from './sync/SyncManager';
import { getAgentStatus } from './ipc/agent';

import './styles/theme.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/windows.css';
import './styles/input-bar.css';
import './styles/sprint2.css';
import './styles/magnetic.css';

// Initialize component registry for dynamic rendering
registerBuiltinComponents();

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

  // H7: Support multiple simultaneous permission requests via queue
  const [permissionQueue, setPermissionQueue] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    // Initialize sync manager
    initSyncManager();

    // Load saved windows from backend
    loadWindows();

    // Check agent status
    getAgentStatus().then((status) => {
      setHasConductor(status.has_conductor);
    });

    // ── Agent response (non-streaming fallback) ─────────────────────────────
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

    // ── Streaming: accumulate tokens into a response window ─────────────────
    // H1: Use a Map to support multiple concurrent streams
    const streamMap = new Map<string, { windowId: string | null; buffer: string }>();

    const unlistenStreamToken = listen<{ token: string; stream_id?: string }>('agent-stream-token', async (event) => {
      const token = event.payload?.token || '';
      const streamId = event.payload?.stream_id || 'default';

      if (!streamMap.has(streamId)) {
        streamMap.set(streamId, { windowId: null, buffer: '' });
      }
      const stream = streamMap.get(streamId)!;
      stream.buffer += token;

      if (!stream.windowId) {
        const win = await addWindow('Response', 'response', stream.buffer);
        stream.windowId = win.id;
      } else {
        setWindowContent(stream.windowId, stream.buffer);
      }
    });

    const unlistenStreamDone = listen<{ stream_id?: string }>('agent-stream-done', (event) => {
      const streamId = event.payload?.stream_id || 'default';
      streamMap.delete(streamId);
      // Only set idle if no more active streams
      if (streamMap.size === 0) {
        setStatus('idle');
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

    // ── System notifications → Toast ──────────────────────────────────────────
    const unlistenNotify = listen<{ message?: string; level?: string }>(
      'system-notification',
      (event) => {
        const msg = event.payload.message || 'Notification';
        const level = (event.payload.level || 'info') as 'info' | 'success' | 'warning' | 'error';
        addToast(msg, level);
      }
    );

    // ── Dynamic app created ──────────────────────────────────────────────────
    const unlistenAppCreated = listen<{
      app_id: string;
      window_id: string;
      spec: any;
      data?: Record<string, any>;
    }>('app-created', (event) => {
      const { app_id, window_id, spec } = event.payload;
      useAppStore.getState().registerApp(app_id, spec, window_id);
      // Add the window locally only if backend hasn't already synced it
      const existing = useWindowStore.getState().windows.find((w) => w.id === window_id);
      if (!existing) {
        useWindowStore.getState().addWindowLocal({
          id: window_id,
          title: spec.title || 'App',
          bounds: {
            x: 100, y: 100,
            width: spec.width || 600,
            height: spec.height || 400,
          },
          z_order: 999,
          visibility: 'visible',
          focused: true,
          content_type: 'dynamic_app',
          created_at: new Date().toISOString(),
        });
      }
    });

    // ── Dynamic app data update ──────────────────────────────────────────────
    const unlistenAppUpdate = listen<{
      app_id: string;
      data?: Record<string, any>;
      spec?: any;
    }>('app-updated', (event) => {
      const { app_id, data, spec } = event.payload;
      if (data) useAppStore.getState().updateAppData(app_id, data);
      if (spec) useAppStore.getState().updateAppSpec(app_id, spec);
    });

    // ── Dynamic app destroyed ────────────────────────────────────────────────
    const unlistenAppDestroyed = listen<{ app_id: string }>('app-destroyed', (event) => {
      useAppStore.getState().destroyApp(event.payload.app_id);
    });

    // ── Permission requests (Sprint 2) ────────────────────────────────────────
    const unlistenPermission = listen<PermissionRequest>(
      'permission-request',
      (event) => {
        // H7: Queue permission requests instead of replacing
        setPermissionQueue((prev) => [...prev, event.payload]);
      }
    );

    return () => {
      unlistenResponse.then((fn) => fn());
      unlistenStreamToken.then((fn) => fn());
      unlistenStreamDone.then((fn) => fn());
      unlistenWindowCreate.then((fn) => fn());
      unlistenContentUpdate.then((fn) => fn());
      unlistenNotify.then((fn) => fn());
      unlistenPermission.then((fn) => fn());
      unlistenAppCreated.then((fn) => fn());
      unlistenAppUpdate.then((fn) => fn());
      unlistenAppDestroyed.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <Desktop />
      <AmbientBadge />
      <ToastContainer />
      {permissionQueue.length > 0 && (
        <PermissionDialog
          request={permissionQueue[0]}
          onResolved={() => setPermissionQueue((prev) => prev.slice(1))}
        />
      )}
    </>
  );
}

export default App;
