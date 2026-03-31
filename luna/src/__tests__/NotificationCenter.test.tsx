import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  NotificationCenter,
  addNotification,
  clearNotifications,
  getUnreadCount,
  markRead,
} from '../components/NotificationCenter';

describe('NotificationCenter', () => {
  beforeEach(() => {
    clearNotifications();
  });

  it('shows empty state when no notifications', () => {
    render(<NotificationCenter onClose={() => {}} />);
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('adds and displays notifications', () => {
    addNotification('Test Title', 'Test body message', 'info');
    render(<NotificationCenter onClose={() => {}} />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test body message')).toBeInTheDocument();
  });

  it('tracks unread count', () => {
    expect(getUnreadCount()).toBe(0);
    addNotification('N1', 'Body 1', 'info');
    addNotification('N2', 'Body 2', 'success');
    expect(getUnreadCount()).toBe(2);
  });

  it('marks notifications as read', () => {
    const notif = addNotification('Read Me', 'Body', 'info');
    expect(getUnreadCount()).toBe(1);
    markRead(notif.id);
    expect(getUnreadCount()).toBe(0);
  });

  it('limits to 50 notifications', () => {
    for (let i = 0; i < 60; i++) {
      addNotification(`N${i}`, `Body ${i}`, 'info');
    }
    expect(getUnreadCount()).toBe(50);
  });

  it('clears all notifications', () => {
    addNotification('N1', 'B1', 'info');
    addNotification('N2', 'B2', 'warning');
    clearNotifications();
    expect(getUnreadCount()).toBe(0);
  });

  it('calls onClose when close button clicked', () => {
    let closed = false;
    addNotification('Test', 'Body', 'info');
    render(<NotificationCenter onClose={() => { closed = true; }} />);
    // The close button has ✕ text
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find(b => b.textContent === '✕' && b.title !== 'Notifications');
    if (closeBtn) fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });
});
