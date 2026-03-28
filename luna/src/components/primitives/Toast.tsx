import { useState, useEffect, useCallback } from 'react';
import '../../styles/primitives/toast.css';

export interface ToastMessage {
  id: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

/** Global toast notification container. Use addToast() to show messages. */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Expose add/remove via window for easy IPC integration
  useEffect(() => {
    (window as any).__luna_addToast = (toast: ToastMessage) => {
      setToasts(prev => [...prev, toast]);
    };
    return () => {
      delete (window as any).__luna_addToast;
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="luna-toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    const duration = toast.duration ?? 4000;
    if (duration <= 0) return;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <div className={`luna-toast luna-toast--${toast.level} ${exiting ? 'luna-toast--exiting' : ''}`}>
      <span className="luna-toast__icon">
        {toast.level === 'success' && '✓'}
        {toast.level === 'error' && '✕'}
        {toast.level === 'warning' && '!'}
        {toast.level === 'info' && 'i'}
      </span>
      <span className="luna-toast__message">{toast.message}</span>
      <button className="luna-toast__close" onClick={dismiss}>
        &times;
      </button>
    </div>
  );
}

/** Helper to add a toast from anywhere in the app. */
export function addToast(message: string, level: ToastMessage['level'] = 'info', duration?: number) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fn = (window as any).__luna_addToast;
  if (fn) fn({ id, message, level, duration });
}
