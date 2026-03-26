import { listen } from '@tauri-apps/api/event';

type SyncCallback = (payload: any) => void;

interface SyncUpdate {
  topic: string;
  payload: any;
}

const subscriptions: Map<string, Set<SyncCallback>> = new Map();
let initialized = false;
let initializing = false;

/** Initialize the sync manager. Subscribes to the backend sync event. */
export async function initSyncManager() {
  // H12: Guard against concurrent initialization
  if (initialized || initializing) return;
  initializing = true;

  // Listen for batched sync events from backend
  await listen<SyncUpdate[]>('luna-sync', (event) => {
    const updates = event.payload;
    for (const update of updates) {
      dispatch(update.topic, update.payload);
    }
  });

  // Also support individual sync events
  await listen<SyncUpdate>('luna-sync-single', (event) => {
    dispatch(event.payload.topic, event.payload.payload);
  });

  // H12: Mark initialized only after all listeners are registered
  initialized = true;
}

/** Subscribe to a topic pattern. Returns an unsubscribe function. */
export function subscribe(topic: string, callback: SyncCallback): () => void {
  if (!subscriptions.has(topic)) {
    subscriptions.set(topic, new Set());
  }
  subscriptions.get(topic)!.add(callback);

  return () => {
    const subs = subscriptions.get(topic);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscriptions.delete(topic);
    }
  };
}

/** Dispatch an update to matching subscribers. */
function dispatch(topic: string, payload: any) {
  for (const [pattern, callbacks] of subscriptions) {
    if (topicMatches(pattern, topic)) {
      for (const cb of callbacks) {
        cb(payload);
      }
    }
  }
}

/** Check if a subscription pattern matches a topic. */
function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return topic.startsWith(prefix + '.');
  }
  return false;
}
