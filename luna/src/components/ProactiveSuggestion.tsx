import { useState, useEffect, useCallback } from 'react';
import { GLASS } from './apps/glassStyles';
import {
  onSuggestionChange,
  dismissSuggestion,
  type ProactiveSuggestion as Suggestion,
} from '../services/proactiveEngine';

export function ProactiveSuggestionCard() {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return onSuggestionChange((s) => {
      if (s) {
        setSuggestion(s);
        // Slide in after brief delay
        setTimeout(() => setVisible(true), 50);
      } else {
        setVisible(false);
        setTimeout(() => setSuggestion(null), 300);
      }
    });
  }, []);

  const handleDismiss = useCallback(() => {
    if (suggestion) {
      setVisible(false);
      setTimeout(() => {
        dismissSuggestion(suggestion.id);
        setSuggestion(null);
      }, 300);
    }
  }, [suggestion]);

  const handleAction = useCallback(() => {
    if (suggestion) {
      suggestion.action();
      setVisible(false);
      setTimeout(() => {
        dismissSuggestion(suggestion.id);
        setSuggestion(null);
      }, 300);
    }
  }, [suggestion]);

  if (!suggestion) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 72, right: 16, zIndex: 8000,
        width: 280,
        ...GLASS.elevated,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        padding: '14px 16px',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.96)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        cursor: 'pointer',
      }}
      onClick={handleAction}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(126, 184, 255, 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            {suggestion.text}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {suggestion.reason}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          style={{
            ...GLASS.ghostBtn,
            width: 22, height: 22, padding: 0, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
