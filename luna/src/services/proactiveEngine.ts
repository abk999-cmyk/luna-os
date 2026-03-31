import { useWindowStore } from '../stores/windowStore';
import { useActivityStore } from '../stores/activityStore';
import { useAgentStore } from '../stores/agentStore';

export interface ProactiveSuggestion {
  id: string;
  text: string;
  reason: string;
  action: () => void;
  dismissedAt?: number;
}

let currentSuggestion: ProactiveSuggestion | null = null;
let lastSuggestionTime = 0;
let dismissedSuggestions = new Map<string, number>(); // id -> dismiss timestamp
const suggestionListeners: Set<(s: ProactiveSuggestion | null) => void> = new Set();

const MIN_INTERVAL = 5 * 60 * 1000;  // 5 minutes between suggestions
const DISMISS_COOLDOWN = 30 * 60 * 1000; // 30 minutes after dismiss

function notifySuggestionListeners() {
  suggestionListeners.forEach(fn => fn(currentSuggestion));
}

export function onSuggestionChange(fn: (s: ProactiveSuggestion | null) => void): () => void {
  suggestionListeners.add(fn);
  return () => { suggestionListeners.delete(fn); };
}

export function dismissSuggestion(id: string) {
  dismissedSuggestions.set(id, Date.now());
  if (currentSuggestion?.id === id) {
    currentSuggestion = null;
    notifySuggestionListeners();
  }
}

export function getCurrentSuggestion(): ProactiveSuggestion | null {
  return currentSuggestion;
}

function setSuggestion(suggestion: ProactiveSuggestion) {
  // Check cooldown
  const dismissed = dismissedSuggestions.get(suggestion.id);
  if (dismissed && Date.now() - dismissed < DISMISS_COOLDOWN) return;

  currentSuggestion = suggestion;
  lastSuggestionTime = Date.now();
  notifySuggestionListeners();
}

function checkContext() {
  const now = Date.now();

  // Frequency cap
  if (now - lastSuggestionTime < MIN_INTERVAL) return;

  // Don't interrupt active work
  const agentStatus = useAgentStore.getState().status;
  if (agentStatus === 'streaming') return;

  const events = useActivityStore.getState().events;
  const windows = useWindowStore.getState().windows;

  // Check: idle for 5+ minutes
  const lastEventTime = events.length > 0
    ? new Date(events[0].timestamp).getTime()
    : 0;
  const idleTime = now - lastEventTime;

  if (idleTime > 5 * 60 * 1000 && windows.length > 0) {
    setSuggestion({
      id: 'idle-checkin',
      text: 'Need help with anything?',
      reason: 'You\'ve been idle for a bit',
      action: () => {
        const input = document.querySelector('.input-bar__field') as HTMLInputElement;
        if (input) input.focus();
      },
    });
    return;
  }

  // Check: many windows open
  const visibleWindows = windows.filter(w => w.visibility === 'visible');
  if (visibleWindows.length >= 5) {
    setSuggestion({
      id: 'organize-windows',
      text: 'Want me to organize your windows?',
      reason: `${visibleWindows.length} windows open`,
      action: () => {
        // Pre-fill input with organize request
        const input = document.querySelector('.input-bar__field') as HTMLInputElement;
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(input, 'Organize my windows');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          input.focus();
        }
      },
    });
    return;
  }

  // Check: time-based (morning brief)
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 10 && events.length < 3) {
    setSuggestion({
      id: 'morning-brief',
      text: 'Want me to get you ready for today?',
      reason: 'Good morning',
      action: () => {
        const input = document.querySelector('.input-bar__field') as HTMLInputElement;
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(input, 'Get me ready for today');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          input.focus();
        }
      },
    });
    return;
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startProactiveEngine() {
  if (intervalId) return;
  intervalId = setInterval(checkContext, 60_000); // Check every 60s
  // Run initial check after 30s
  setTimeout(checkContext, 30_000);
}

export function stopProactiveEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
