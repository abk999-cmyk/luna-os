import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette, registerCommand, type Command } from '../components/CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    // Reset by rendering fresh
  });

  it('is hidden by default', () => {
    const { container } = render(<CommandPalette />);
    // When closed, CommandPalette returns null
    expect(container.firstChild).toBeNull();
  });

  it('opens via Cmd+K keyboard shortcut', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    // Should now show the search input
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { container } = render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText(/search/i), { key: 'Escape' });
    // Should be closed now — container should be empty
    expect(container.querySelector('input')).toBeNull();
  });

  it('registers and displays commands', () => {
    const cmd: Command = {
      id: 'test-cmd-1',
      label: 'Test Command Alpha',
      category: 'action',
      action: () => {},
    };
    const unsub = registerCommand(cmd);

    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByText('Test Command Alpha')).toBeInTheDocument();
    unsub();
  });

  it('filters commands by search query', () => {
    const cmd1: Command = {
      id: 'filter-1',
      label: 'Open Settings',
      category: 'action',
      action: () => {},
    };
    const cmd2: Command = {
      id: 'filter-2',
      label: 'Create Note',
      category: 'action',
      action: () => {},
    };
    const unsub1 = registerCommand(cmd1);
    const unsub2 = registerCommand(cmd2);

    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'settings' } });

    // HighlightMatch splits text into spans; search results should contain "Open Settings"
    const matches = screen.getAllByText((_, el) => el?.textContent === 'Open Settings');
    expect(matches.length).toBeGreaterThan(0);
    // "Create Note" should be filtered out
    const noMatch = screen.queryAllByText((_, el) => el?.textContent === 'Create Note');
    expect(noMatch.length).toBe(0);

    unsub1();
    unsub2();
  });

  it('shows AI search option when query starts with ?', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: '?what is the weather' } });

    expect(screen.getByText(/Ask Luna/)).toBeInTheDocument();
  });
});
