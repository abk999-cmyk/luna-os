import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Desktop } from './components/Desktop';
import { useWindowStore } from './stores/windowStore';
import { useAgentStore } from './stores/agentStore';
import { getAgentStatus } from './ipc/agent';

import './styles/theme.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/windows.css';
import './styles/input-bar.css';

function App() {
  const loadWindows = useWindowStore((s) => s.loadWindows);
  const addWindow = useWindowStore((s) => s.addWindow);
  const setWindowContent = useWindowStore((s) => s.setWindowContent);
  const setHasConductor = useAgentStore((s) => s.setHasConductor);
  const setStatus = useAgentStore((s) => s.setStatus);

  useEffect(() => {
    // Load saved windows from backend
    loadWindows();

    // Check agent status
    getAgentStatus().then((status) => {
      setHasConductor(status.has_conductor);
    });

    // Listen for agent responses
    const unlistenResponse = listen<{ text?: string }>('agent-response', async (event) => {
      const text = event.payload?.text || 'No response';
      setStatus('idle');

      // Find existing response window or create new one
      const windows = useWindowStore.getState().windows;
      const existingResponse = windows.find(
        (w) => w.content_type === 'response' && w.focused
      );

      if (existingResponse) {
        // Append to existing window
        const existing = useWindowStore.getState().windowContent.get(existingResponse.id) || '';
        setWindowContent(existingResponse.id, existing ? existing + '\n\n---\n\n' + text : text);
      } else {
        // Create new response window
        await addWindow('Response', 'response', text);
      }
    });

    // Listen for agent window creation
    const unlistenWindowCreate = listen<{ title?: string; content_type?: string }>(
      'agent-window-create',
      async (event) => {
        const title = event.payload?.title || 'New Window';
        const contentType = event.payload?.content_type || 'panel';
        await addWindow(title, contentType);
      }
    );

    return () => {
      unlistenResponse.then((fn) => fn());
      unlistenWindowCreate.then((fn) => fn());
    };
  }, []);

  return <Desktop />;
}

export default App;
