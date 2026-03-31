import { useCallback, useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useActivityStore } from '../../stores/activityStore';
import { useAgentStore } from '../../stores/agentStore';
import { useWindowStore } from '../../stores/windowStore';
import { GLASS } from '../apps/glassStyles';

// Mock weather data seeded by date
function getWeatherData() {
  const day = new Date().getDate();
  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'];
  const temps = [72, 68, 65, 58, 75, 70, 63, 77, 60, 67];
  return {
    condition: conditions[day % conditions.length],
    temp: temps[day % temps.length],
    high: temps[day % temps.length] + 5,
    low: temps[day % temps.length] - 8,
    icon: ['\u2600\uFE0F', '\u26C5', '\u2601\uFE0F', '\uD83C\uDF27\uFE0F', '\uD83C\uDF19'][day % 5],
  };
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Extract events from calendar window content
function extractCalendarEvents(windowContent: Map<string, string>, windows: any[]): any[] {
  for (const w of windows) {
    if (w.content_type === 'calendar') {
      const content = windowContent.get(w.id);
      if (content) {
        try {
          const data = JSON.parse(content);
          return (data.events || []).slice(0, 3);
        } catch { /* ignore */ }
      }
    }
  }
  return [];
}

// Extract todos from todo window content
function extractTodos(windowContent: Map<string, string>, windows: any[]): any[] {
  for (const w of windows) {
    if (w.content_type === 'todo') {
      const content = windowContent.get(w.id);
      if (content) {
        try {
          const data = JSON.parse(content);
          const allItems = (data.lists || []).flatMap((l: any) => l.items || []);
          return allItems.filter((i: any) => !i.done).slice(0, 4);
        } catch { /* ignore */ }
      }
    }
  }
  return [];
}

const SUGGESTED_PROMPTS = [
  { label: 'Get me ready for today', icon: '\u2728' },
  { label: 'Create a new document', icon: '\uD83D\uDCC4' },
  { label: 'Check my schedule', icon: '\uD83D\uDCC5' },
  { label: 'Start a focus session', icon: '\uD83C\uDFAF' },
];

export function HomeSurface() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const events = useActivityStore((s) => s.events);
  const agentStatus = useAgentStore((s) => s.status);
  const windows = useWindowStore((s) => s.windows);
  const windowContent = useWindowStore((s) => s.windowContent);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const greeting = getGreeting();
  const date = getFormattedDate();
  const weather = useMemo(() => getWeatherData(), []);
  const calendarEvents = useMemo(() => extractCalendarEvents(windowContent, windows), [windowContent, windows]);
  const todos = useMemo(() => extractTodos(windowContent, windows), [windowContent, windows]);
  const recentEvents = events.slice(0, 5);

  const handlePromptClick = useCallback((prompt: string) => {
    const input = document.querySelector('.input-bar__field') as HTMLInputElement | null;
    if (input) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.focus();
    }
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 32px 32px', gap: 24, height: '100%', overflowY: 'auto',
      color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {greeting}
        </div>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 400 }}>
          {date}
        </div>
        {activeWorkspace?.name && (
          <div style={{ fontSize: 12, color: 'var(--accent-primary)', marginTop: 6, fontWeight: 500 }}>
            {activeWorkspace.name}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: agentStatus === 'streaming' ? 'var(--accent-primary)' : '#4ade80',
          boxShadow: agentStatus === 'streaming'
            ? '0 0 8px var(--accent-primary)'
            : '0 0 8px rgba(74, 222, 128, 0.4)',
        }} />
        {agentStatus === 'streaming' ? 'Luna is working' : 'Luna is ready'}
      </div>

      {/* Widget grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, width: '100%', maxWidth: 640,
      }}>
        {/* Weather card */}
        <div style={{
          ...GLASS.surface, borderRadius: 12, padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 32 }}>{weather.icon}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{weather.temp}°F</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {weather.condition} · H:{weather.high}° L:{weather.low}°
            </div>
          </div>
        </div>

        {/* Schedule card */}
        <div style={{
          ...GLASS.surface, borderRadius: 12, padding: '14px 18px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Today's Schedule
          </div>
          {calendarEvents.length > 0 ? calendarEvents.map((ev: any, i: number) => (
            <div key={i} style={{
              fontSize: 12, padding: '4px 0',
              borderTop: i > 0 ? `1px solid ${GLASS.dividerColor}` : 'none',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ color: 'var(--text-primary)' }}>{ev.title}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {ev.start ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No events today</div>
          )}
        </div>
      </div>

      {/* Tasks section */}
      {todos.length > 0 && (
        <div style={{
          ...GLASS.surface, borderRadius: 12, padding: '14px 18px',
          width: '100%', maxWidth: 640,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Priority Tasks
          </div>
          {todos.map((task: any, i: number) => (
            <div key={i} style={{
              fontSize: 12, padding: '5px 0', display: 'flex', alignItems: 'center', gap: 8,
              borderTop: i > 0 ? `1px solid ${GLASS.dividerColor}` : 'none',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : 'var(--text-tertiary)',
                flexShrink: 0,
              }} />
              <span>{task.title || task.text || 'Untitled'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {recentEvents.length > 0 && (
        <div style={{
          width: '100%', maxWidth: 640,
          fontSize: 12, color: 'var(--text-secondary)',
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 500 }}>{events.length} actions</span>
          <span>·</span>
          <span>{events.filter(e => e.type === 'window').length} windows</span>
          <span>·</span>
          <span>{events.filter(e => e.type === 'file').length} files</span>
        </div>
      )}

      {/* Suggested prompts */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        justifyContent: 'center', maxWidth: 640,
      }}>
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handlePromptClick(prompt.label)}
            style={{
              ...GLASS.ghostBtn,
              padding: '8px 16px', borderRadius: 20,
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = GLASS.hoverBg;
              e.currentTarget.style.borderColor = GLASS.selectedBorder;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <span>{prompt.icon}</span>
            <span>{prompt.label}</span>
          </button>
        ))}
      </div>

      {/* Goal */}
      {activeWorkspace?.goal && (
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic',
          textAlign: 'center', maxWidth: 400,
        }}>
          {activeWorkspace.goal}
        </div>
      )}
    </div>
  );
}
