import { useMemo } from 'react';
import { useActivityStore } from '../stores/activityStore';

export interface WindowPresence {
  active: boolean;
  lastAction: string;
  timestamp: number;
}

const ACTIVE_THRESHOLD_MS = 3000;

/**
 * Hook that tracks which windows the agent is currently touching.
 * Active = action within last 3 seconds.
 */
export function useWindowAgentPresence(windowId?: string): WindowPresence | null {
  const events = useActivityStore((s) => s.events);

  return useMemo(() => {
    if (!windowId) return null;

    const now = Date.now();
    // Find the most recent event for this window
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.windowId === windowId) {
        return {
          active: now - e.timestamp < ACTIVE_THRESHOLD_MS,
          lastAction: e.description,
          timestamp: e.timestamp,
        };
      }
    }
    return null;
  }, [windowId, events]);
}

/**
 * Returns a map of windowId -> presence for all active windows.
 */
export function useActiveWindowPresence(): Map<string, WindowPresence> {
  const events = useActivityStore((s) => s.events);

  return useMemo(() => {
    const now = Date.now();
    const map = new Map<string, WindowPresence>();

    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.windowId && !map.has(e.windowId)) {
        map.set(e.windowId, {
          active: now - e.timestamp < ACTIVE_THRESHOLD_MS,
          lastAction: e.description,
          timestamp: e.timestamp,
        });
      }
    }

    return map;
  }, [events]);
}
