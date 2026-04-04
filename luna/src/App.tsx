import { useEffect, useState, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Desktop } from './components/Desktop';
import { PermissionDialog } from './components/PermissionDialog';
import { CommandPalette, getTogglePalette } from './components/CommandPalette';
import { ToastContainer, addToast } from './components/primitives/Toast';
import { useWindowStore } from './stores/windowStore';
import { useAgentStore } from './stores/agentStore';
import { useAppStore } from './stores/appStore';
import { useTaskStore, type Plan } from './stores/taskStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { registerBuiltinComponents } from './renderer/ComponentRegistry';
import { initSyncManager } from './sync/SyncManager';
import { getAgentStatus } from './ipc/agent';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useShellStore } from './stores/shellStore';
import { useActivityStore } from './stores/activityStore';
import { getPermissionMode } from './ipc/permissions';
import { undoLastAction } from './ipc/undo';
import { loadActiveApps } from './ipc/apps';

import './styles/theme.css';
import './styles/dark-theme.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/liquid-glass.css';
import './styles/windows.css';
import './styles/input-bar.css';
import './styles/sprint2.css';
import './styles/magnetic.css';
import './styles/shell.css';

import { ProactiveSuggestionCard } from './components/ProactiveSuggestion';
import { addNotification } from './components/NotificationCenter';
import { startProactiveEngine } from './services/proactiveEngine';
import { playNotificationSound } from './services/soundManager';

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

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'meta+shift+k': getTogglePalette(),
    'f3': () => useShellStore.getState().toggleMissionControl(),
    'meta+z': () => {
      undoLastAction().then((r: { undone: boolean }) => {
        if (r.undone) addToast('Action undone', 'success');
      }).catch(() => {});
    },
  }), []);
  useKeyboardShortcuts(shortcuts);

  useEffect(() => {
    // Initialize sync manager
    initSyncManager();

    // Start proactive suggestion engine
    startProactiveEngine();

    // Load saved windows from backend
    loadWindows();

    // Load persisted settings (theme, permissionMode, sidebarCollapsed)
    useShellStore.getState().loadSettings();

    // Check agent status
    getAgentStatus().then((status) => {
      setHasConductor(status.has_conductor);
    });

    // Load workspaces
    useWorkspaceStore.getState().loadWorkspaces();

    // Load persisted dynamic apps
    loadActiveApps().then((apps) => {
      for (const app of apps) {
        try {
          const spec = JSON.parse(app.descriptor_json);
          const data = JSON.parse(app.data_context_json || '{}');

          // Register in appStore
          useAppStore.getState().registerApp(app.app_id, spec, app.window_id);
          if (data && Object.keys(data).length > 0) {
            useAppStore.getState().updateAppData(app.app_id, data);
          }

          // Add window locally if not already present
          const existing = useWindowStore.getState().windows.find(w => w.id === app.window_id);
          if (!existing) {
            useWindowStore.getState().addWindowLocal({
              id: app.window_id,
              title: spec.title || 'Generated App',
              bounds: { x: 100, y: 100, width: spec.width || 600, height: spec.height || 400 },
              z_order: 0,
              visibility: 'visible',
              focused: false,
              content_type: 'dynamic_app',
              created_at: new Date(app.created_at).toISOString(),
            });
          }
        } catch (e) {
          console.warn('[App] Failed to restore dynamic app:', app.app_id, e);
        }
      }
    }).catch(() => {});

    // Load permission mode
    getPermissionMode().then((mode) => {
      useShellStore.getState().setPermissionMode(mode);
    }).catch(() => {});

    // ── Agent response → chat panel ─────────────────────────────────────────
    const unlistenResponse = listen<{ text?: string }>('agent-response', (_event) => {
      const text = _event.payload?.text || 'No response';
      setStatus('idle');
      useAgentStore.getState().addChatMessage('assistant', text);
    });

    // ── Streaming: track status + accumulate response text ──────────────────
    const unlistenStreamToken = listen<{ token: string; stream_id?: string }>('agent-stream-token', (_event) => {
      setStatus('streaming');
    });

    const unlistenStreamDone = listen<{ stream_id?: string }>('agent-stream-done', (_event) => {
      // Finalize streaming: create chat message from accumulated tokens, clear state
      useAgentStore.getState().finalizeStream();
      setStatus('idle');
    });

    // ── Capture ALL agent actions into activityStore + chat ─────────────────
    const unlistenAgentAction = listen<{ action_type: string; payload?: Record<string, unknown>; agent_id?: string }>(
      'agent-action',
      (event) => {
        const { action_type, payload, agent_id } = event.payload;

        // Skip agent.response — handled by the dedicated agent-response listener
        if (action_type === 'agent.response') return;

        // Feed ALL non-response actions into activityStore for visibility
        {
          const actEvent = useActivityStore.getState().addEvent({
            action_type,
            type: undefined as any, // deriveType handles it
            description: '', // describeAction handles it
            status: 'completed',
            payload: payload || {},
            agentId: agent_id,
            windowId: (payload?.window_id as string) || undefined,
          });

          // Track as streaming action for inline chat cards
          useAgentStore.getState().addStreamingAction({
            id: actEvent.id,
            type: actEvent.type,
            action_type: actEvent.action_type,
            description: actEvent.description,
            timestamp: actEvent.timestamp,
            status: actEvent.status,
            windowId: actEvent.windowId,
          });
        }
      }
    );

    // ── Agent window creation ────────────────────────────────────────────────
    const windowCreateDedup = new Map<string, number>();
    const DEDUP_MS = 500;
    const unlistenWindowCreate = listen<Record<string, unknown>>(
      'agent-window-create',
      async (event) => {
        const p = event.payload || {};
        const title = (p.title as string) || 'New Window';
        const contentType = (p.content_type as string) || 'panel';
        // Dedup guard: skip if same title+contentType was created within dedup window
        const dedupKey = `${title}::${contentType}`;
        const now = Date.now();
        const lastTime = windowCreateDedup.get(dedupKey);
        if (lastTime && now - lastTime < DEDUP_MS) return;
        windowCreateDedup.set(dedupKey, now);
        // LLM may use content, text, or body for the window content
        const content = (p.content as string) || (p.text as string) || (p.body as string) || '';
        // Pass through geometry from payload
        const x = p.x != null ? Number(p.x) : undefined;
        const y = p.y != null ? Number(p.y) : undefined;
        const width = p.width != null ? Number(p.width) : undefined;
        const height = p.height != null ? Number(p.height) : undefined;
        await addWindow(title, contentType, content, x, y, width, height);

        // Track in activityStore
        useActivityStore.getState().addEvent({
          action_type: 'window.create',
          type: 'window',
          description: `Opened "${title}"`,
          status: 'completed',
          payload: { title, content_type: contentType },
        });
      }
    );

    // ── Agent window close (0D: backend emits this but frontend wasn't listening)
    const unlistenWindowClose = listen<{ window_id?: string }>(
      'agent-window-close',
      (event) => {
        const windowId = event.payload?.window_id;
        if (windowId) {
          useWindowStore.getState().removeWindowLocal(windowId);
        }
      }
    );

    // ── Agent window focus (0D: backend emits this but frontend wasn't listening)
    const unlistenWindowFocus = listen<{ window_id?: string }>(
      'agent-window-focus',
      (event) => {
        const windowId = event.payload?.window_id;
        if (windowId) {
          useWindowStore.getState().focusWindow(windowId);
        }
      }
    );

    // ── Window content update (Sprint 2) ─────────────────────────────────────
    const unlistenContentUpdate = listen<{ window_id?: string; content?: string }>(
      'window-content-update',
      (event) => {
        const { window_id, content } = event.payload;
        if (window_id && content !== undefined) {
          setWindowContent(window_id, content);
          useActivityStore.getState().addEvent({
            action_type: 'window.update_content',
            type: 'window',
            description: 'Updated window content',
            status: 'completed',
            payload: { window_id },
            windowId: window_id,
          });
        }
      }
    );

    // ── Window content read (cross-app intelligence) ────────────────────────
    const unlistenContentRead = listen<{ window_id?: string; title?: string; content_type?: string }>(
      'window-content-read',
      (event) => {
        const { window_id } = event.payload;
        if (!window_id) return;
        const content = useWindowStore.getState().windowContent.get(window_id);
        const windows = useWindowStore.getState().windows;
        const win = windows.find(w => w.id === window_id);

        // Feed content back to the chat as context
        const contentPreview = content
          ? (content.length > 2000 ? content.slice(0, 2000) + '...(truncated)' : content)
          : '(no content)';
        const title = win?.title || event.payload.title || 'Unknown';

        useAgentStore.getState().addChatMessage('assistant',
          `Read content from "${title}":\n\`\`\`\n${contentPreview}\n\`\`\``
        );
      }
    );

    // ── System notifications → Toast + NotificationCenter + Sound ──────────────
    const unlistenNotify = listen<{ message?: string; level?: string; title?: string }>(
      'system-notification',
      (event) => {
        const msg = event.payload.message || 'Notification';
        const title = event.payload.title || 'Luna';
        const level = (event.payload.level || 'info') as 'info' | 'success' | 'warning' | 'error';
        addToast(msg, level);
        addNotification(title, msg, level);
        playNotificationSound();
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
      console.log('[App] app-created event:', { app_id, window_id, specTitle: spec?.title, components: spec?.components?.length, specKeys: Object.keys(spec || {}) });
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
      } else if (existing.content_type !== 'dynamic_app') {
        // Backend may have loaded this window with default content_type; fix it
        useWindowStore.setState((state) => ({
          windows: state.windows.map((w) =>
            w.id === window_id ? { ...w, content_type: 'dynamic_app' } : w
          ),
        }));
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

    // ── Workspace events ─────────────────────────────────────────────────────
    const unlistenWorkspaceSwitched = listen<{ workspace_id: string }>(
      'workspace-switched',
      (event) => {
        const workspaceId = event.payload.workspace_id;
        if (workspaceId) {
          useWindowStore.getState().loadWindows();
          useWorkspaceStore.getState().setActiveWorkspaceId(workspaceId);
          addToast(`Switched to workspace`, 'info');
        }
      }
    );

    const unlistenWorkspaceCreated = listen<{ workspace_id: string; name: string }>(
      'workspace-created',
      (event) => {
        const { name } = event.payload;
        useWorkspaceStore.getState().loadWorkspaces();
        addToast(`Workspace "${name}" created`, 'success');
      }
    );

    // ── Plan events ──────────────────────────────────────────────────────────
    const unlistenPlanCreated = listen<{ plan: Plan }>(
      'plan-created',
      (event) => {
        const { plan } = event.payload;
        if (plan) {
          useTaskStore.getState().addPlan(plan);
          useActivityStore.getState().addEvent({
            action_type: 'plan.create',
            type: 'plan',
            description: `Created plan: ${plan.title || plan.id}`,
            status: 'completed',
            payload: { plan_id: plan.id, title: plan.title },
          });
        }
      }
    );

    const unlistenPlanUpdated = listen<{ plan: Plan }>(
      'plan-updated',
      (event) => {
        const { plan } = event.payload;
        if (plan) {
          useTaskStore.getState().updatePlan(plan);
          useActivityStore.getState().addEvent({
            action_type: 'plan.update',
            type: 'plan',
            description: 'Updated plan',
            status: 'completed',
            payload: { plan_id: plan.id },
          });
        }
      }
    );

    return () => {
      unlistenResponse.then((fn) => fn());
      unlistenStreamToken.then((fn) => fn());
      unlistenStreamDone.then((fn) => fn());
      unlistenAgentAction.then((fn) => fn());
      unlistenWindowCreate.then((fn) => fn());
      unlistenWindowClose.then((fn) => fn());
      unlistenWindowFocus.then((fn) => fn());
      unlistenContentUpdate.then((fn) => fn());
      unlistenContentRead.then((fn) => fn());
      unlistenNotify.then((fn) => fn());
      unlistenPermission.then((fn) => fn());
      unlistenAppCreated.then((fn) => fn());
      unlistenAppUpdate.then((fn) => fn());
      unlistenAppDestroyed.then((fn) => fn());
      unlistenWorkspaceSwitched.then((fn) => fn());
      unlistenWorkspaceCreated.then((fn) => fn());
      unlistenPlanCreated.then((fn) => fn());
      unlistenPlanUpdated.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <Desktop />
      {/* AmbientBadge removed — voice mode via swipe-right on input bar */}
      <CommandPalette />
      <ToastContainer />
      <ProactiveSuggestionCard />
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
