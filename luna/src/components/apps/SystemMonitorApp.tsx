import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Process {
  name: string;
  pid: number;
  cpu: number;
  memory: number;
  status: 'Running' | 'Sleeping' | 'Idle' | 'Restarted';
}

type SortKey = 'name' | 'pid' | 'cpu' | 'memory' | 'status';
type SortDir = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/*  Initial data                                                       */
/* ------------------------------------------------------------------ */

const PROCESS_NAMES = [
  'luna-conductor',
  'webkit-renderer',
  'node',
  'system-daemon',
  'glass-compositor',
  'audio-server',
  'file-indexer',
  'bluetooth-mgr',
  'wifi-daemon',
  'gpu-driver',
  'input-handler',
  'notification-svc',
  'update-checker',
  'cloud-sync',
  'security-agent',
];

function makeProcesses(): Process[] {
  return PROCESS_NAMES.map((name, i) => ({
    name,
    pid: 1000 + i * 37,
    cpu: Math.round(Math.random() * 30 * 10) / 10,
    memory: Math.round((20 + Math.random() * 400) * 10) / 10,
    status: Math.random() > 0.3 ? 'Running' : Math.random() > 0.5 ? 'Sleeping' : 'Idle',
  }));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
    padding: 12,
    gap: 12,
    overflowY: 'auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    flexShrink: 0,
  },
  card: {
    ...GLASS.elevated,
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  bigValue: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-primary)',
  },
  chartSvg: {
    width: '100%',
    height: 100,
  },
  tableCard: {
    ...GLASS.elevated,
    borderRadius: 12,
    padding: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono, monospace)',
    whiteSpace: 'nowrap',
  },
  killBtn: {
    ...GLASS.ghostBtn,
    padding: '2px 8px',
    fontSize: 11,
    borderRadius: 6,
    color: '#ff6b6b',
    borderColor: 'rgba(255,107,107,0.2)',
  },
  sortArrow: {
    marginLeft: 4,
    fontSize: 10,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SystemMonitorApp() {
  const [cpuHistory, setCpuHistory] = useState<number[]>(() =>
    Array.from({ length: 60 }, () => 20 + Math.random() * 40)
  );
  const [memUsed, setMemUsed] = useState(8.2);
  const [processes, setProcesses] = useState<Process[]>(makeProcesses);
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const killedRef = useRef<Map<string, number>>(new Map());

  /* Tick every second */
  useEffect(() => {
    const timer = setInterval(() => {
      setCpuHistory((prev) => {
        const last = prev[prev.length - 1];
        const next = clamp(last + (Math.random() - 0.45) * 15, 5, 95);
        return [...prev.slice(1), next];
      });

      setMemUsed((prev) => clamp(prev + (Math.random() - 0.5) * 0.3, 4, 15.5));

      setProcesses((prev) =>
        prev.map((p) => ({
          ...p,
          cpu: Math.round(clamp(p.cpu + (Math.random() - 0.48) * 5, 0, 100) * 10) / 10,
          memory: Math.round(clamp(p.memory + (Math.random() - 0.5) * 20, 10, 800) * 10) / 10,
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /* Kill process */
  const killProcess = useCallback((name: string) => {
    setProcesses((prev) => prev.filter((p) => p.name !== name));
    const timeout = window.setTimeout(() => {
      setProcesses((prev) => {
        if (prev.some((p) => p.name === name)) return prev;
        return [
          ...prev,
          {
            name,
            pid: 2000 + Math.floor(Math.random() * 8000),
            cpu: Math.round(Math.random() * 10 * 10) / 10,
            memory: Math.round((20 + Math.random() * 100) * 10) / 10,
            status: 'Restarted' as const,
          },
        ];
      });
    }, 5000);
    killedRef.current.set(name, timeout);
  }, []);

  useEffect(() => {
    return () => {
      killedRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  /* Sort */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'status' ? 'asc' : 'desc');
    }
  };

  const sorted = [...processes].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  /* CPU chart */
  const cpuCurrent = Math.round(cpuHistory[cpuHistory.length - 1]);
  const cpuPoints = cpuHistory
    .map((v, i) => {
      const x = (i / 59) * 100;
      const y = 100 - v;
      return `${x},${y}`;
    })
    .join(' ');

  /* Memory gauge */
  const memTotal = 16;
  const memPct = (memUsed / memTotal) * 100;
  const memColor = memPct > 90 ? '#ff6b6b' : memPct > 70 ? '#d4a574' : 'var(--accent-primary)';
  const circumference = 2 * Math.PI * 70;
  const dashOffset = circumference - (memPct / 100) * circumference;

  const renderSortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span style={S.sortArrow}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  return (
    <div style={S.root}>
      {/* Top row: CPU + Memory */}
      <div style={S.grid}>
        {/* CPU */}
        <div style={S.card}>
          <span style={S.cardTitle}>CPU</span>
          <span style={S.bigValue}>{cpuCurrent}%</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={S.chartSvg}>
            {/* Grid lines */}
            {[25, 50, 75].map((y) => (
              <line
                key={y}
                x1={0}
                y1={100 - y}
                x2={100}
                y2={100 - y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={0.5}
              />
            ))}
            {/* Area fill */}
            <polygon
              points={`0,100 ${cpuPoints} 100,100`}
              fill="rgba(126,184,255,0.08)"
            />
            {/* Line */}
            <polyline
              points={cpuPoints}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Memory */}
        <div style={{ ...S.card, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ ...S.cardTitle, alignSelf: 'flex-start' }}>Memory</span>
          <svg width={160} height={160} viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx={80}
              cy={80}
              r={70}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={10}
            />
            {/* Progress ring */}
            <circle
              cx={80}
              cy={80}
              r={70}
              fill="none"
              stroke={memColor}
              strokeWidth={10}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
              style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
            />
            {/* Center text */}
            <text
              x={80}
              y={74}
              textAnchor="middle"
              fill="var(--text-primary)"
              fontSize={16}
              fontWeight={700}
              fontFamily="var(--font-mono, monospace)"
            >
              {memUsed.toFixed(1)} GB
            </text>
            <text
              x={80}
              y={96}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={11}
            >
              of {memTotal} GB
            </text>
          </svg>
        </div>
      </div>

      {/* Process table */}
      <div style={S.tableCard}>
        <div style={S.tableHeader}>
          <span style={S.cardTitle}>Processes ({processes.length})</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {([
                  ['name', 'Name'],
                  ['pid', 'PID'],
                  ['cpu', 'CPU %'],
                  ['memory', 'Memory (MB)'],
                  ['status', 'Status'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} style={S.th} onClick={() => handleSort(key)}>
                    {label}
                    {renderSortArrow(key)}
                  </th>
                ))}
                <th style={{ ...S.th, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr
                  key={p.name}
                  style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <td style={S.td}>{p.name}</td>
                  <td style={S.td}>{p.pid}</td>
                  <td
                    style={{
                      ...S.td,
                      color: p.cpu > 50 ? '#ff6b6b' : p.cpu > 25 ? '#d4a574' : undefined,
                    }}
                  >
                    {p.cpu.toFixed(1)}
                  </td>
                  <td style={S.td}>{p.memory.toFixed(1)}</td>
                  <td
                    style={{
                      ...S.td,
                      color:
                        p.status === 'Running'
                          ? '#a8cc8c'
                          : p.status === 'Restarted'
                          ? '#d4a574'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {p.status}
                  </td>
                  <td style={S.td}>
                    <button
                      style={S.killBtn}
                      onClick={() => killProcess(p.name)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,107,107,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          GLASS.ghostBtn.background as string;
                      }}
                    >
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SystemMonitorApp;
