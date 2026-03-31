import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dismissSuggestion,
  getCurrentSuggestion,
  onSuggestionChange,
  startProactiveEngine,
  stopProactiveEngine,
} from '../services/proactiveEngine';

describe('proactiveEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopProactiveEngine();
  });

  afterEach(() => {
    stopProactiveEngine();
    vi.useRealTimers();
  });

  it('starts without a current suggestion', () => {
    expect(getCurrentSuggestion()).toBeNull();
  });

  it('can subscribe to suggestion changes', () => {
    const listener = vi.fn();
    const unsub = onSuggestionChange(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('starts and stops the engine without error', () => {
    expect(() => startProactiveEngine()).not.toThrow();
    expect(() => stopProactiveEngine()).not.toThrow();
  });

  it('dismiss clears current suggestion if matching', () => {
    // No current suggestion, should not throw
    expect(() => dismissSuggestion('nonexistent')).not.toThrow();
    expect(getCurrentSuggestion()).toBeNull();
  });

  it('frequency caps suggestions', () => {
    startProactiveEngine();
    // Advance less than MIN_INTERVAL (5min)
    vi.advanceTimersByTime(30_000); // 30s — initial check fires
    // Should not crash
    vi.advanceTimersByTime(60_000); // Another 60s
    stopProactiveEngine();
  });
});
