import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Phase = 'focus' | 'short_break' | 'long_break' | 'times_up';

interface SessionRecord {
  id: number;
  task: string;
  duration: number;
  phase: Phase;
  completedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMM_SS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case 'focus':
      return 'Focus';
    case 'short_break':
      return 'Short Break';
    case 'long_break':
      return 'Long Break';
    case 'times_up':
      return "Time's up!";
  }
}

function phaseColor(p: Phase): string {
  return p === 'focus' || p === 'times_up' ? 'var(--accent-primary)' : '#a8cc8c';
}

let nextRecordId = 1;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
    alignItems: 'center',
    padding: '20px 24px',
    gap: 20,
    overflowY: 'auto',
  },
  taskInput: {
    ...GLASS.inset,
    width: '100%',
    maxWidth: 340,
    padding: '8px 14px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    borderRadius: 8,
    textAlign: 'center',
  },
  timerWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  timeDisplay: {
    fontSize: 36,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-primary)',
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  dots: {
    display: 'flex',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    transition: 'background 0.2s',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    ...GLASS.accentBtn,
    padding: '8px 28px',
    fontSize: 14,
    borderRadius: 8,
  },
  secondaryBtn: {
    ...GLASS.ghostBtn,
    padding: '8px 16px',
    fontSize: 13,
    borderRadius: 8,
  },
  settingsPanel: {
    ...GLASS.elevated,
    borderRadius: 12,
    padding: '14px 20px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '8px 16px',
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  settingLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  settingInput: {
    ...GLASS.inset,
    width: 56,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'var(--font-mono, monospace)',
    textAlign: 'center',
    borderRadius: 6,
  },
  historyWrap: {
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  historyList: {
    ...GLASS.scrollList,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  historyCard: {
    ...GLASS.elevated,
    borderRadius: 10,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PomodoroApp() {
  const [focusMin, setFocusMin] = useState(25);
  const [shortBreakMin, setShortBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [soundOn, setSoundOn] = useState(true);

  const [phase, setPhase] = useState<Phase>('focus');
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60);
  const [session, setSession] = useState(1); // 1-4
  const [completedSessions, setCompletedSessions] = useState(0);
  const [task, setTask] = useState('');
  const [history, setHistory] = useState<SessionRecord[]>([]);

  const tickRef = useRef<number>(0);
  const timesUpRef = useRef<number>(0);

  /* Duration for current phase */
  const phaseDuration = useCallback(
    (p: Phase) => {
      switch (p) {
        case 'focus':
          return focusMin * 60;
        case 'short_break':
          return shortBreakMin * 60;
        case 'long_break':
          return longBreakMin * 60;
        default:
          return 0;
      }
    },
    [focusMin, shortBreakMin, longBreakMin]
  );

  /* Next phase logic */
  const advancePhase = useCallback(() => {
    if (phase === 'focus') {
      // Record completed focus session
      setHistory((prev) => [
        {
          id: nextRecordId++,
          task: task || 'Untitled',
          duration: focusMin,
          phase: 'focus',
          completedAt: new Date(),
        },
        ...prev,
      ]);
      setCompletedSessions((c) => c + 1);

      if (session >= 4) {
        // After 4th focus => long break
        setPhase('long_break');
        setRemaining(longBreakMin * 60);
        setSession(1);
      } else {
        setPhase('short_break');
        setRemaining(shortBreakMin * 60);
      }
    } else {
      // Break ended => next focus
      if (phase === 'short_break') {
        setSession((s) => s + 1);
      }
      setPhase('focus');
      setRemaining(focusMin * 60);
    }
    setRunning(false);
  }, [phase, session, focusMin, shortBreakMin, longBreakMin, task]);

  /* Timer completed -> show "Time's up!" for 2s then advance */
  const handleTimerDone = useCallback(() => {
    setRunning(false);
    const prevPhase = phase;
    setPhase('times_up');
    timesUpRef.current = window.setTimeout(() => {
      // Restore to what we were, then advance
      setPhase(prevPhase);
      // Use a micro-delay so the state is committed
      setTimeout(() => advancePhase(), 0);
    }, 2000);
  }, [phase, advancePhase]);

  /* Tick */
  useEffect(() => {
    if (running && phase !== 'times_up') {
      tickRef.current = window.setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(tickRef.current);
            handleTimerDone();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(tickRef.current);
  }, [running, phase, handleTimerDone]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      clearInterval(tickRef.current);
      clearTimeout(timesUpRef.current);
    };
  }, []);

  /* Controls */
  const handleStartPause = () => {
    if (phase === 'times_up') return;
    setRunning((r) => !r);
  };

  const handleReset = () => {
    setRunning(false);
    clearTimeout(timesUpRef.current);
    if (phase === 'times_up') setPhase('focus');
    setRemaining(phaseDuration(phase === 'times_up' ? 'focus' : phase));
  };

  const handleSkip = () => {
    setRunning(false);
    clearTimeout(timesUpRef.current);
    if (phase === 'times_up') {
      setPhase('focus');
      setRemaining(focusMin * 60);
    } else {
      advancePhase();
    }
  };

  /* Ring progress */
  const totalDuration = phase === 'times_up' ? 1 : phaseDuration(phase);
  const progress = totalDuration > 0 ? 1 - remaining / totalDuration : 0;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const ringColor = phaseColor(phase);

  /* Setting change handlers */
  const clampSetting = (v: string, min: number, max: number): number => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  };

  /* Session dots (show 4 dots for focus sessions) */
  const totalFocusSessions = 4;
  const currentCycleCompleted = completedSessions % 4;

  return (
    <div style={S.root}>
      {/* Task input */}
      <input
        style={S.taskInput}
        placeholder="What are you working on?"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />

      {/* Timer ring */}
      <div style={S.timerWrap as React.CSSProperties}>
        <svg width={200} height={200} viewBox="0 0 200 200">
          {/* Background ring */}
          <circle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={8}
          />
          {/* Progress ring */}
          <circle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={8}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            style={{ transition: running ? 'stroke-dashoffset 1s linear' : 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div style={S.timerText as React.CSSProperties}>
          <span style={S.timeDisplay}>
            {phase === 'times_up' ? '00:00' : formatMM_SS(remaining)}
          </span>
          <span style={{ ...S.phaseLabel, color: ringColor }}>{phaseLabel(phase)}</span>
        </div>
      </div>

      {/* Session info */}
      <div style={S.sessionInfo as React.CSSProperties}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Session {Math.min(session, 4)} of {totalFocusSessions}
        </span>
        <div style={S.dots}>
          {Array.from({ length: totalFocusSessions }, (_, i) => (
            <div
              key={i}
              style={{
                ...S.dot,
                background:
                  i < currentCycleCompleted
                    ? 'var(--accent-primary)'
                    : 'rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={S.controls}>
        <button style={S.secondaryBtn} onClick={handleReset}>
          Reset
        </button>
        <button
          style={{
            ...S.primaryBtn,
            opacity: phase === 'times_up' ? 0.5 : 1,
          }}
          onClick={handleStartPause}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button style={S.secondaryBtn} onClick={handleSkip}>
          Skip
        </button>
      </div>

      {/* Settings */}
      <div style={S.settingsPanel}>
        <span style={S.settingLabel}>Focus (min)</span>
        <input
          style={S.settingInput}
          type="number"
          min={1}
          max={60}
          value={focusMin}
          onChange={(e) => {
            const v = clampSetting(e.target.value, 1, 60);
            setFocusMin(v);
            if (phase === 'focus' && !running) setRemaining(v * 60);
          }}
        />
        <span style={S.settingLabel}>Short break (min)</span>
        <input
          style={S.settingInput}
          type="number"
          min={1}
          max={30}
          value={shortBreakMin}
          onChange={(e) => {
            const v = clampSetting(e.target.value, 1, 30);
            setShortBreakMin(v);
            if (phase === 'short_break' && !running) setRemaining(v * 60);
          }}
        />
        <span style={S.settingLabel}>Long break (min)</span>
        <input
          style={S.settingInput}
          type="number"
          min={1}
          max={60}
          value={longBreakMin}
          onChange={(e) => {
            const v = clampSetting(e.target.value, 1, 60);
            setLongBreakMin(v);
            if (phase === 'long_break' && !running) setRemaining(v * 60);
          }}
        />
        <span style={S.settingLabel}>Sound</span>
        <button
          style={{
            ...GLASS.ghostBtn,
            padding: '3px 10px',
            fontSize: 11,
            borderRadius: 6,
            color: soundOn ? 'var(--accent-primary)' : 'var(--text-secondary)',
          }}
          onClick={() => setSoundOn((s) => !s)}
        >
          {soundOn ? 'On' : 'Off'}
        </button>
      </div>

      {/* Session history */}
      {history.length > 0 && (
        <div style={S.historyWrap as React.CSSProperties}>
          <span style={S.historyTitle}>Session History</span>
          <div style={S.historyList as React.CSSProperties}>
            {history.map((rec) => (
              <div key={rec.id} style={S.historyCard}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {rec.task}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {rec.duration} min focus
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {formatTime(rec.completedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PomodoroApp;
