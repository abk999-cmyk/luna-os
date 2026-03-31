import { useState, useCallback } from 'react';
import { GLASS } from './apps/glassStyles';

export interface Notification {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

// Global notification store
let notifications: Notification[] = [];
const notifListeners: Set<() => void> = new Set();

function notifyListeners() {
  notifListeners.forEach(fn => fn());
}

export function addNotification(title: string, body: string, level: Notification['level'] = 'info', actionLabel?: string, onAction?: () => void) {
  const notif: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title, body, level,
    timestamp: Date.now(),
    read: false,
    actionLabel, onAction,
  };
  notifications = [notif, ...notifications].slice(0, 50); // Keep max 50
  notifyListeners();
  return notif;
}

export function markRead(id: string) {
  notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n);
  notifyListeners();
}

export function clearNotifications() {
  notifications = [];
  notifyListeners();
}

export function getUnreadCount(): number {
  return notifications.filter(n => !n.read).length;
}

function useNotifications(): Notification[] {
  const [, setTick] = useState(0);
  // Subscribe on mount
  useState(() => {
    const listener = () => setTick(t => t + 1);
    notifListeners.add(listener);
    return () => { notifListeners.delete(listener); };
  });
  return notifications;
}

const levelColors: Record<Notification['level'], string> = {
  info: 'var(--accent-primary)',
  success: '#4ade80',
  warning: '#f59e0b',
  error: '#ef4444',
};

const levelIcons: Record<Notification['level'], string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '✕',
};

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const allNotifs = useNotifications();

  const handleClear = useCallback(() => {
    clearNotifications();
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 36, right: 8, width: 340, maxHeight: 'calc(100vh - 80px)',
      ...GLASS.elevated, borderRadius: 12,
      boxShadow: '0 16px 64px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', zIndex: 9000,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px',
        borderBottom: `1px solid ${GLASS.dividerColor}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Notifications
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {allNotifs.length > 0 && (
            <button
              onClick={handleClear}
              style={{ ...GLASS.ghostBtn, fontSize: 11, padding: '3px 8px', borderRadius: 6 }}
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            style={{ ...GLASS.ghostBtn, fontSize: 14, padding: '2px 8px', borderRadius: 6, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {allNotifs.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--text-tertiary)', fontSize: 13,
          }}>
            No notifications
          </div>
        ) : (
          allNotifs.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              style={{
                padding: '10px 16px', cursor: 'pointer',
                borderBottom: `1px solid ${GLASS.dividerColor}`,
                background: n.read ? 'transparent' : 'rgba(126, 184, 255, 0.04)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = GLASS.hoverBg}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(126, 184, 255, 0.04)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, width: 20, height: 20,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${levelColors[n.level]}22`,
                  color: levelColors[n.level], flexShrink: 0, marginTop: 1,
                }}>
                  {levelIcons[n.level]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: n.read ? 400 : 600,
                    color: 'var(--text-primary)', marginBottom: 2,
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    lineHeight: 1.4, wordBreak: 'break-word',
                  }}>
                    {n.body}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {formatTimeAgo(n.timestamp)}
                    </span>
                    {n.actionLabel && n.onAction && (
                      <button
                        onClick={(e) => { e.stopPropagation(); n.onAction!(); }}
                        style={{
                          ...GLASS.ghostBtn, fontSize: 11, padding: '2px 8px', borderRadius: 6,
                          color: 'var(--accent-primary)',
                          border: `1px solid ${GLASS.selectedBorder}`,
                        }}
                      >
                        {n.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent-primary)', flexShrink: 0, marginTop: 6,
                  }} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
