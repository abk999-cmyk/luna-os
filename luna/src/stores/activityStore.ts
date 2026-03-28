import { create } from 'zustand';

export type ActivityType = 'file' | 'shell' | 'window' | 'memory' | 'agent' | 'plan' | 'system';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  action_type: string;
  description: string;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
  payload?: Record<string, unknown>;
  windowId?: string;
  agentId?: string;
}

const MAX_EVENTS = 500;

interface ActivityStore {
  events: ActivityEvent[];
  addEvent: (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => ActivityEvent;
  updateEvent: (id: string, updates: Partial<ActivityEvent>) => void;
  getRecentEvents: (limit: number) => ActivityEvent[];
  getEventsByType: (type: ActivityType) => ActivityEvent[];
  getActiveWindowIds: () => Set<string>;
  clearEvents: () => void;
}

let eventCounter = 0;

/** Derive ActivityType from action_type string */
function deriveType(actionType: string): ActivityType {
  const prefix = actionType.split('.')[0];
  switch (prefix) {
    case 'fs': case 'file': return 'file';
    case 'shell': return 'shell';
    case 'window': return 'window';
    case 'memory': return 'memory';
    case 'agent': return 'agent';
    case 'plan': return 'plan';
    default: return 'system';
  }
}

/** Generate human-readable description from action_type + payload */
function describeAction(actionType: string, payload?: Record<string, unknown>): string {
  const p = payload || {};

  switch (actionType) {
    case 'fs.read': case 'file.read':
      return `Read ${basename(String(p.path || p.file_path || 'file'))}`;
    case 'fs.write': case 'file.write':
      return `Wrote ${basename(String(p.path || p.file_path || 'file'))}`;
    case 'fs.delete': case 'file.delete':
      return `Deleted ${basename(String(p.path || p.file_path || 'file'))}`;
    case 'fs.list': case 'file.list':
      return `Listed ${basename(String(p.path || p.directory || 'directory'))}`;
    case 'fs.move':
      return `Moved ${basename(String(p.from || p.source || 'file'))}`;
    case 'fs.mkdir':
      return `Created directory ${basename(String(p.path || 'directory'))}`;

    case 'shell.execute':
      return `Ran \`${truncate(String(p.command || p.cmd || ''), 40)}\``;

    case 'window.create':
      return `Opened "${p.title || 'window'}"`;
    case 'window.close':
      return `Closed window`;
    case 'window.update_content':
      return `Updated "${p.title || 'window'}"`;
    case 'window.focus':
      return `Focused "${p.title || 'window'}"`;
    case 'window.resize':
      return `Resized window`;
    case 'window.minimize':
      return `Minimized window`;

    case 'memory.store':
      return `Remembered: ${truncate(String(p.key || p.summary || ''), 30)}`;
    case 'memory.retrieve':
      return `Recalled: ${truncate(String(p.key || p.query || ''), 30)}`;
    case 'memory.delete':
      return `Forgot: ${truncate(String(p.key || ''), 30)}`;
    case 'memory.search':
      return `Searched memory: ${truncate(String(p.query || p.tag || ''), 30)}`;

    case 'agent.spawn':
      return `Started sub-agent: ${truncate(String(p.task || p.name || ''), 30)}`;
    case 'agent.kill':
      return `Stopped sub-agent`;
    case 'agent.response':
      return `Responding...`;
    case 'agent.think':
      return `Thinking...`;
    case 'agent.delegate':
      return `Delegated task`;

    case 'plan.create':
      return `Created plan: ${truncate(String(p.name || p.title || ''), 30)}`;
    case 'plan.update':
      return `Updated plan`;

    case 'system.notify':
      return `Notification: ${truncate(String(p.message || ''), 30)}`;

    default: {
      const action = actionType.split('.').slice(1).join('.');
      return `${actionType.split('.')[0]}.${action || 'action'}`;
    }
  }
}

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  events: [],

  addEvent: (partial) => {
    const event: ActivityEvent = {
      ...partial,
      id: `act-${++eventCounter}-${Date.now()}`,
      timestamp: Date.now(),
      type: partial.type || deriveType(partial.action_type),
      description: partial.description || describeAction(partial.action_type, partial.payload),
    };
    set((s) => ({
      events: [...s.events.slice(-MAX_EVENTS + 1), event],
    }));
    return event;
  },

  updateEvent: (id, updates) =>
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  getRecentEvents: (limit) => {
    const { events } = get();
    return events.slice(-limit);
  },

  getEventsByType: (type) => {
    return get().events.filter((e) => e.type === type);
  },

  getActiveWindowIds: () => {
    const now = Date.now();
    const threshold = 3000; // 3 seconds
    const active = new Set<string>();
    for (const e of get().events) {
      if (e.windowId && now - e.timestamp < threshold && e.status !== 'failed') {
        active.add(e.windowId);
      }
    }
    return active;
  },

  clearEvents: () => set({ events: [] }),
}));

export { deriveType, describeAction };
