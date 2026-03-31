import { describe, it, expect } from 'vitest';
import {
  setSoundEnabled,
  isSoundEnabled,
  playNotificationSound,
  playSuccessSound,
  playErrorSound,
  playAlertSound,
} from '../services/soundManager';

describe('soundManager', () => {
  it('defaults to enabled', () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it('can be toggled off and on', () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it('plays sounds without throwing', () => {
    expect(() => playNotificationSound()).not.toThrow();
    expect(() => playSuccessSound()).not.toThrow();
    expect(() => playErrorSound()).not.toThrow();
    expect(() => playAlertSound()).not.toThrow();
  });

  it('does not throw when disabled', () => {
    setSoundEnabled(false);
    expect(() => playNotificationSound()).not.toThrow();
    expect(() => playSuccessSound()).not.toThrow();
    setSoundEnabled(true);
  });
});
