import { useState, useEffect } from 'react';
import { GLASS } from './apps/glassStyles';

export function WelcomeOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Check if this is first launch
    const seen = localStorage.getItem('luna-welcome-seen');
    if (!seen) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem('luna-welcome-seen', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const steps = [
    {
      title: 'Welcome to Luna OS',
      body: 'An AI-native desktop where everything is controllable by intelligence. Type in the input bar to get started.',
      icon: '\u2728',
    },
    {
      title: 'Talk to Luna',
      body: 'Use the input bar at the bottom to ask Luna anything. "Create a spreadsheet", "Check my calendar", "Build me a habit tracker" \u2014 Luna handles it all.',
      icon: '\uD83D\uDCAC',
    },
    {
      title: 'Apps that work for you',
      body: 'Every app is designed for AI control. Luna can read, modify, and compose across all your open windows.',
      icon: '\uD83E\uDE9F',
    },
    {
      title: 'Search everything',
      body: 'Press Cmd+K to search across all your notes, contacts, calendar, and files. Start with ? to ask Luna directly.',
      icon: '\uD83D\uDD0D',
    },
  ];

  const s = steps[step];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 20000,
    }}>
      <div style={{
        ...GLASS.elevated, borderRadius: 16, width: 420, padding: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>{s.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{s.title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 340 }}>
          {s.body}
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === step ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{...GLASS.ghostBtn, padding: '8px 20px', borderRadius: 8, fontSize: 13}}>
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{...GLASS.accentBtn, padding: '8px 20px', borderRadius: 8, fontSize: 13}}>
              Next
            </button>
          ) : (
            <button onClick={dismiss}
              style={{...GLASS.accentBtn, padding: '8px 20px', borderRadius: 8, fontSize: 13}}>
              Get Started
            </button>
          )}
        </div>

        <button onClick={dismiss}
          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
          Skip intro
        </button>
      </div>
    </div>
  );
}
