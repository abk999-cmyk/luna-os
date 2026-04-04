import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

// Import all app components
import { CalculatorApp } from '../components/apps/CalculatorApp';
import { WeatherApp } from '../components/apps/WeatherApp';
import { ClockApp } from '../components/apps/ClockApp';
import { PomodoroApp } from '../components/apps/PomodoroApp';
import { SettingsApp } from '../components/apps/SettingsApp';

describe('App Component Smoke Tests', () => {
  it('renders CalculatorApp without crashing', () => {
    const { container } = render(<CalculatorApp />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders WeatherApp without crashing', () => {
    const { container } = render(<WeatherApp />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders ClockApp without crashing', () => {
    const { container } = render(<ClockApp />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders PomodoroApp without crashing', () => {
    const { container } = render(<PomodoroApp />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders SettingsApp without crashing', () => {
    const { container } = render(<SettingsApp />);
    expect(container.firstChild).toBeTruthy();
  });
});
