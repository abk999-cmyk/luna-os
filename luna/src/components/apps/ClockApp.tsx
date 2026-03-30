import React, { useState, useEffect, useRef } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = 'world' | 'alarms' | 'stopwatch' | 'timer';

interface WorldCity {
  id: string;
  name: string;
  offsetHours: number; // offset from local time
}

interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
}

interface Lap {
  num: number;
  split: number;  // ms since last lap
  total: number;  // ms total
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIMEZONE_PRESETS: { name: string; offset: number }[] = [
  { name: 'New York',      offset: -5 },
  { name: 'London',        offset: 0 },
  { name: 'Paris',         offset: 1 },
  { name: 'Dubai',         offset: 4 },
  { name: 'Mumbai',        offset: 5.5 },
  { name: 'Shanghai',      offset: 8 },
  { name: 'Tokyo',         offset: 9 },
  { name: 'Sydney',        offset: 11 },
  { name: 'Auckland',      offset: 13 },
  { name: 'Honolulu',      offset: -10 },
];

const TIMER_PRESETS = [
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${pad2(min)}:${pad2(sec)}.${pad2(cs)}`;
}

function formatTimerRemaining(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
  },
  tabBar: {
    display: 'flex',
    gap: 2,
    padding: '8px 12px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 16,
  },
  /* Analog clock */
  clockWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  digitalTime: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-primary)',
    letterSpacing: '1px',
  },
  digitalDate: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  /* City list */
  cityRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  cityName: {
    fontSize: 13,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  cityOffset: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginLeft: 8,
  },
  cityTime: {
    fontSize: 14,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-secondary)',
  },
  addRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  /* Alarms */
  alarmRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  alarmTime: {
    fontSize: 24,
    fontWeight: 300,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-primary)',
  },
  alarmLabel: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
    marginTop: 2,
  },
  alarmActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 9999,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s ease',
    border: 'none',
    padding: 0,
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute' as const,
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 9999,
    background: '#fff',
    transition: 'left 0.2s ease',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 4px',
    lineHeight: 1,
  },
  /* New alarm form */
  alarmForm: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  timeInput: {
    ...GLASS.inset,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    width: 50,
    textAlign: 'center' as const,
  },
  labelInput: {
    ...GLASS.inset,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    flex: 1,
  },
  /* Stopwatch */
  swDisplay: {
    fontSize: 48,
    fontWeight: 200,
    fontFamily: 'var(--font-mono, monospace)',
    textAlign: 'center' as const,
    color: 'var(--text-primary)',
    padding: '24px 0 20px',
    letterSpacing: '2px',
  },
  swControls: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  lapTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  lapHeader: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
    textAlign: 'left' as const,
    padding: '6px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  lapCell: {
    fontSize: 13,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-secondary)',
    padding: '6px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  /* Timer */
  timerPresets: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  timerRingWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative' as const,
    margin: '16px auto',
    width: 200,
    height: 200,
  },
  timerRemaining: {
    position: 'absolute' as const,
    fontSize: 32,
    fontWeight: 200,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-primary)',
  },
  timerControls: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  timerDone: {
    textAlign: 'center' as const,
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    marginTop: 12,
  },
  customTimerRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
};

/* ------------------------------------------------------------------ */
/*  Analog Clock SVG                                                   */
/* ------------------------------------------------------------------ */

function AnalogClock({ date, size = 160 }: { date: Date; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  const h = date.getHours() % 12;
  const m = date.getMinutes();
  const s = date.getSeconds();

  const hourAngle = (h + m / 60) * 30 - 90;
  const minAngle = (m + s / 60) * 6 - 90;
  const secAngle = s * 6 - 90;

  const hand = (angle: number, length: number, width: number, color: string) => {
    const rad = (angle * Math.PI) / 180;
    const x2 = cx + Math.cos(rad) * length;
    const y2 = cy + Math.sin(rad) * length;
    return (
      <line
        x1={cx} y1={cy} x2={x2} y2={y2}
        stroke={color} strokeWidth={width} strokeLinecap="round"
      />
    );
  };

  const marks = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * Math.PI / 180;
    const isHour = true;
    const outerR = r - 2;
    const innerR = isHour ? r - 10 : r - 6;
    marks.push(
      <line
        key={i}
        x1={cx + Math.cos(angle) * innerR}
        y1={cy + Math.sin(angle) * innerR}
        x2={cx + Math.cos(angle) * outerR}
        y2={cy + Math.sin(angle) * outerR}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={i % 3 === 0 ? 2 : 1}
        strokeLinecap="round"
      />
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
      {marks}
      {hand(hourAngle, r * 0.5, 3, 'rgba(255,255,255,0.8)')}
      {hand(minAngle, r * 0.7, 2, 'rgba(255,255,255,0.6)')}
      {hand(secAngle, r * 0.75, 1, 'var(--accent-primary)')}
      <circle cx={cx} cy={cy} r={3} fill="var(--accent-primary)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: World Clock                                                   */
/* ------------------------------------------------------------------ */

function WorldClockTab() {
  const [now, setNow] = useState(new Date());
  const [cities, setCities] = useState<WorldCity[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const localOffsetH = -now.getTimezoneOffset() / 60;

  const addCity = () => {
    const p = TIMEZONE_PRESETS[selectedPreset];
    if (cities.some(c => c.name === p.name)) return;
    setCities(prev => [...prev, {
      id: crypto.randomUUID(),
      name: p.name,
      offsetHours: p.offset - localOffsetH,
    }]);
    setAddOpen(false);
  };

  const removeCity = (id: string) => {
    setCities(prev => prev.filter(c => c.id !== id));
  };

  const cityTime = (city: WorldCity) => {
    const d = new Date(now.getTime() + city.offsetHours * 3600000);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };

  const fmtOffset = (off: number) => {
    const sign = off >= 0 ? '+' : '';
    return `${sign}${off}h`;
  };

  return (
    <div>
      <div style={S.clockWrap}>
        <AnalogClock date={now} />
        <div style={S.digitalTime}>
          {pad2(now.getHours())}:{pad2(now.getMinutes())}:{pad2(now.getSeconds())}
        </div>
        <div style={S.digitalDate}>
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {cities.map(c => (
        <div key={c.id} style={S.cityRow}>
          <div>
            <span style={S.cityName}>{c.name}</span>
            <span style={S.cityOffset}>{fmtOffset(c.offsetHours)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.cityTime}>{cityTime(c)}</span>
            <button style={S.deleteBtn} onClick={() => removeCity(c.id)} title="Remove">x</button>
          </div>
        </div>
      ))}

      {addOpen ? (
        <div style={S.addRow}>
          <select
            style={{ ...GLASS.inset, padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', flex: 1 }}
            value={selectedPreset}
            onChange={e => setSelectedPreset(Number(e.target.value))}
          >
            {TIMEZONE_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>{p.name} (UTC{p.offset >= 0 ? '+' : ''}{p.offset})</option>
            ))}
          </select>
          <button style={{ ...GLASS.accentBtn, padding: '6px 14px', fontSize: 12 }} onClick={addCity}>Add</button>
          <button style={{ ...GLASS.ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => setAddOpen(false)}>Cancel</button>
        </div>
      ) : (
        <button
          style={{ ...GLASS.ghostBtn, padding: '8px 14px', fontSize: 12, marginTop: 12 }}
          onClick={() => setAddOpen(true)}
        >
          + Add City
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Alarms                                                        */
/* ------------------------------------------------------------------ */

function AlarmsTab() {
  const [alarms, setAlarms] = useState<Alarm[]>([
    { id: '1', hour: 7, minute: 0, label: 'Wake up', enabled: true },
    { id: '2', hour: 8, minute: 30, label: 'Standup', enabled: false },
  ]);
  const [newHour, setNewHour] = useState('08');
  const [newMin, setNewMin] = useState('00');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const toggleAlarm = (id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlarm = (id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const addAlarm = () => {
    const h = Math.min(23, Math.max(0, parseInt(newHour) || 0));
    const m = Math.min(59, Math.max(0, parseInt(newMin) || 0));
    setAlarms(prev => [...prev, {
      id: crypto.randomUUID(),
      hour: h,
      minute: m,
      label: newLabel || 'Alarm',
      enabled: true,
    }]);
    setNewHour('08');
    setNewMin('00');
    setNewLabel('');
    setAdding(false);
  };

  return (
    <div>
      {alarms.map(a => (
        <div key={a.id} style={S.alarmRow}>
          <div>
            <div style={{
              ...S.alarmTime,
              opacity: a.enabled ? 1 : 0.4,
            }}>
              {pad2(a.hour)}:{pad2(a.minute)}
            </div>
            <div style={S.alarmLabel}>{a.label}</div>
          </div>
          <div style={S.alarmActions}>
            <button
              style={{
                ...S.toggle,
                background: a.enabled ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
              }}
              onClick={() => toggleAlarm(a.id)}
            >
              <div style={{
                ...S.toggleKnob,
                left: a.enabled ? 18 : 2,
              }} />
            </button>
            <button style={S.deleteBtn} onClick={() => deleteAlarm(a.id)} title="Delete">x</button>
          </div>
        </div>
      ))}

      {adding ? (
        <div style={S.alarmForm}>
          <input
            style={S.timeInput}
            value={newHour}
            onChange={e => setNewHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="HH"
          />
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>:</span>
          <input
            style={S.timeInput}
            value={newMin}
            onChange={e => setNewMin(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="MM"
          />
          <input
            style={S.labelInput}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label"
          />
          <button style={{ ...GLASS.accentBtn, padding: '6px 14px', fontSize: 12 }} onClick={addAlarm}>Add</button>
          <button style={{ ...GLASS.ghostBtn, padding: '6px 10px', fontSize: 12 }} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button
          style={{ ...GLASS.ghostBtn, padding: '8px 14px', fontSize: 12, marginTop: 12 }}
          onClick={() => setAdding(true)}
        >
          + Add Alarm
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Stopwatch                                                     */
/* ------------------------------------------------------------------ */

function StopwatchTab() {
  const [elapsed, setElapsed] = useState(0); // ms
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const lastLapRef = useRef(0);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsed;
      intervalRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 10);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartStop = () => setRunning(r => !r);

  const handleReset = () => {
    setRunning(false);
    setElapsed(0);
    setLaps([]);
    lastLapRef.current = 0;
  };

  const handleLap = () => {
    const split = elapsed - lastLapRef.current;
    lastLapRef.current = elapsed;
    setLaps(prev => [{
      num: prev.length + 1,
      split,
      total: elapsed,
    }, ...prev]);
  };

  return (
    <div>
      <div style={S.swDisplay}>{formatMs(elapsed)}</div>
      <div style={S.swControls}>
        <button
          style={{
            ...(running ? GLASS.ghostBtn : GLASS.accentBtn),
            padding: '8px 24px',
            fontSize: 13,
          }}
          onClick={handleStartStop}
        >
          {running ? 'Stop' : elapsed > 0 ? 'Resume' : 'Start'}
        </button>
        {running && (
          <button
            style={{ ...GLASS.ghostBtn, padding: '8px 18px', fontSize: 13 }}
            onClick={handleLap}
          >
            Lap
          </button>
        )}
        {!running && elapsed > 0 && (
          <button
            style={{ ...GLASS.ghostBtn, padding: '8px 18px', fontSize: 13 }}
            onClick={handleReset}
          >
            Reset
          </button>
        )}
      </div>

      {laps.length > 0 && (
        <table style={S.lapTable}>
          <thead>
            <tr>
              <th style={S.lapHeader}>#</th>
              <th style={S.lapHeader}>Split</th>
              <th style={{ ...S.lapHeader, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {laps.map(l => (
              <tr key={l.num}>
                <td style={S.lapCell}>{l.num}</td>
                <td style={S.lapCell}>{formatMs(l.split)}</td>
                <td style={{ ...S.lapCell, textAlign: 'right' }}>{formatMs(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Timer                                                         */
/* ------------------------------------------------------------------ */

function TimerTab() {
  const [totalSeconds, setTotalSeconds] = useState(300); // 5 min default
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [customMin, setCustomMin] = useState('5');
  const intervalRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);

  useEffect(() => {
    if (running && remaining > 0) {
      endTimeRef.current = Date.now() + remaining * 1000;
      intervalRef.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          setRunning(false);
          setDone(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectPreset = (sec: number) => {
    setTotalSeconds(sec);
    setRemaining(sec);
    setRunning(false);
    setDone(false);
  };

  const setCustom = () => {
    const m = Math.max(1, parseInt(customMin) || 1);
    selectPreset(m * 60);
  };

  const handleStartPause = () => {
    if (done) return;
    setRunning(r => !r);
  };

  const handleReset = () => {
    setRunning(false);
    setRemaining(totalSeconds);
    setDone(false);
  };

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const circumference = 2 * Math.PI * 88;
  const dashOffset = circumference * (1 - progress);

  return (
    <div>
      {/* Presets */}
      <div style={S.timerPresets}>
        {TIMER_PRESETS.map(p => (
          <button
            key={p.label}
            style={{
              ...GLASS.ghostBtn,
              padding: '6px 14px',
              fontSize: 12,
              ...(totalSeconds === p.seconds && !running ? { background: GLASS.selectedBg, color: 'var(--accent-primary)' } : {}),
            }}
            onClick={() => selectPreset(p.seconds)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom */}
      <div style={S.customTimerRow}>
        <input
          style={{ ...GLASS.inset, padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font-ui)', width: 60, textAlign: 'center' }}
          value={customMin}
          onChange={e => setCustomMin(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="min"
        />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>min</span>
        <button style={{ ...GLASS.ghostBtn, padding: '6px 12px', fontSize: 12 }} onClick={setCustom}>Set</button>
      </div>

      {/* Ring */}
      <div style={S.timerRingWrap}>
        <svg width={200} height={200} viewBox="0 0 200 200">
          <circle
            cx={100} cy={100} r={88}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={4}
          />
          <circle
            cx={100} cy={100} r={88}
            fill="none"
            stroke={done ? '#f87171' : 'var(--accent-primary)'}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 100 100)"
            style={{ transition: running ? 'none' : 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div style={S.timerRemaining}>
          {formatTimerRemaining(remaining)}
        </div>
      </div>

      {done && <div style={S.timerDone}>Timer Complete</div>}

      {/* Controls */}
      <div style={S.timerControls}>
        <button
          style={{
            ...(running ? GLASS.ghostBtn : GLASS.accentBtn),
            padding: '8px 24px',
            fontSize: 13,
            ...(done ? { opacity: 0.4, cursor: 'default' } : {}),
          }}
          onClick={handleStartPause}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          style={{ ...GLASS.ghostBtn, padding: '8px 18px', fontSize: 13 }}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'world', label: 'World Clock' },
  { key: 'alarms', label: 'Alarms' },
  { key: 'stopwatch', label: 'Stopwatch' },
  { key: 'timer', label: 'Timer' },
];

export function ClockApp() {
  const [activeTab, setActiveTab] = useState<Tab>('world');

  return (
    <div style={S.root}>
      <div style={S.tabBar}>
        {TAB_LABELS.map(t => (
          <button
            key={t.key}
            style={activeTab === t.key ? GLASS.tabActive : GLASS.tab}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={S.body}>
        {activeTab === 'world' && <WorldClockTab />}
        {activeTab === 'alarms' && <AlarmsTab />}
        {activeTab === 'stopwatch' && <StopwatchTab />}
        {activeTab === 'timer' && <TimerTab />}
      </div>
    </div>
  );
}

export default ClockApp;
