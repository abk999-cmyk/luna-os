import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeSurface } from '../components/shell/HomeSurface';

describe('HomeSurface', () => {
  it('renders greeting based on time of day', () => {
    render(<HomeSurface />);
    const hour = new Date().getHours();
    if (hour < 12) {
      expect(screen.getByText('Good morning')).toBeInTheDocument();
    } else if (hour < 17) {
      expect(screen.getByText('Good afternoon')).toBeInTheDocument();
    } else {
      expect(screen.getByText('Good evening')).toBeInTheDocument();
    }
  });

  it('renders weather widget', () => {
    render(<HomeSurface />);
    // Weather card shows temperature with °F
    expect(screen.getByText(/°F/)).toBeInTheDocument();
  });

  it('renders schedule section', () => {
    render(<HomeSurface />);
    expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
  });

  it('shows "No events today" when no calendar data', () => {
    render(<HomeSurface />);
    expect(screen.getByText('No events today')).toBeInTheDocument();
  });

  it('renders suggested prompts', () => {
    render(<HomeSurface />);
    expect(screen.getByText('Get me ready for today')).toBeInTheDocument();
    expect(screen.getByText('Create a new document')).toBeInTheDocument();
    expect(screen.getByText('Check my schedule')).toBeInTheDocument();
    expect(screen.getByText('Start a focus session')).toBeInTheDocument();
  });

  it('renders Luna status', () => {
    render(<HomeSurface />);
    expect(screen.getByText('Luna is ready')).toBeInTheDocument();
  });
});
