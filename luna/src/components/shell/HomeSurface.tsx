import { useCallback } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useActivityStore } from '../../stores/activityStore';
import { useAgentStore } from '../../stores/agentStore';

const SUGGESTED_PROMPTS = [
  { label: 'Analyze my project structure', icon: '◎' },
  { label: 'Create a new document', icon: '◎' },
  { label: 'Review recent changes', icon: '◎' },
  { label: 'Start something new', icon: '◎' },
];

const CAPABILITIES = [
  { label: 'Read files', action_type: 'fs.read' },
  { label: 'Run commands', action_type: 'shell.execute' },
  { label: 'Create documents', action_type: 'window.create' },
  { label: 'Analyze code', action_type: 'agent.think' },
  { label: 'Remember context', action_type: 'memory.store' },
  { label: 'Plan tasks', action_type: 'plan.create' },
];

export function HomeSurface() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const events = useActivityStore((s) => s.events);
  const agentStatus = useAgentStore((s) => s.status);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const greeting = getGreeting();

  // Compute recent activity summary
  const fileEvents = events.filter((e) => e.type === 'file').length;
  const windowEvents = events.filter((e) => e.type === 'window').length;
  const hasActivity = events.length > 0;

  const handlePromptClick = useCallback((prompt: string) => {
    // Find the dock input and pre-fill it
    const input = document.querySelector('.input-bar__field') as HTMLInputElement | null;
    if (input) {
      // Use native setter to trigger React's onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.focus();
    }
  }, []);

  return (
    <div className="home-surface">
      <div className="home-surface__greeting">{greeting}</div>

      {activeWorkspace?.name && (
        <div className="home-surface__workspace-name">{activeWorkspace.name}</div>
      )}

      {/* Status */}
      <div className="home-surface__status">
        {agentStatus === 'streaming' ? (
          <span className="home-surface__status-badge home-surface__status-badge--working">
            <span className="home-surface__status-dot" />
            Luna is working
          </span>
        ) : (
          <span className="home-surface__status-badge">
            <span className="home-surface__status-dot home-surface__status-dot--ready" />
            Luna is ready
          </span>
        )}
      </div>

      {/* Goal or default */}
      <div className="home-surface__goal">
        {activeWorkspace?.goal || 'Describe a task in the input bar, or try a suggestion below.'}
      </div>

      {/* Recent activity summary */}
      {hasActivity && (
        <div className="home-surface__activity-summary">
          {events.length} actions performed
          {fileEvents > 0 && ` · ${fileEvents} files`}
          {windowEvents > 0 && ` · ${windowEvents} windows`}
        </div>
      )}

      {/* Suggested prompts */}
      <div className="home-surface__suggestions">
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            className="home-surface__suggestion-btn"
            onClick={() => handlePromptClick(prompt.label)}
          >
            <span className="home-surface__suggestion-icon">{prompt.icon}</span>
            {prompt.label}
          </button>
        ))}
      </div>

      {/* Capability chips */}
      <div className="home-surface__capabilities">
        {CAPABILITIES.map((cap) => (
          <span key={cap.action_type} className="home-surface__capability-chip">
            {cap.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
