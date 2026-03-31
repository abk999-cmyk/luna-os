import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// Mock AudioContext for soundManager
class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume() {}
  createOscillator() {
    return {
      type: 'sine' as OscillatorType,
      frequency: { value: 440 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { value: 1, exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

Object.defineProperty(window, 'AudioContext', {
  value: MockAudioContext,
  writable: true,
});
