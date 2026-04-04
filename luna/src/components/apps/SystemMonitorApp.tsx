import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GLASS } from './glassStyles';
import { getSystemInfo } from '../../ipc/system';
import type { SystemInfo, ProcessInfo } from '../../ipc/system';

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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Map sysinfo status strings to our UI status type */
function mapStatus(status: string): Process['status'] {
  const s = status.toLowerCase();
  if (s.includes('run')) return 'Running';
  if (s.includes('sleep') || s.includes('idle') || s.includes('stop')) return 'Sleeping';
  return 'Running';
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
  liveIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#a8cc8c',
    animation: 'pulse 2s infinite',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SystemMonitorApp() {
  const [cpuHistory, setCpuHistory] = useState<number[]>(() =>
    Array.from({ length: 60 }, () => 0)
  );
  const [memUsed, setMemUsed] = useState(0);
  const [memTotal, setMemTotal] = useState(16 * 1024); // default 16GB in MB
  const [processes, setProcesses] = useState<Process[]>([]);
  const [processCount, setProcessCount] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [processFilter, setProcessFilter] = useState('');
  const [isLive, setIsLive] = useState(false);
  const killedRef = useRef<Map<string, number>>(new Map());

  /* Fetch real system info every 2 seconds */
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const info: SystemInfo = await getSystemInfo();
        if (cancelled) return;

        setIsLive(true);

        // Update CPU history
        setCpuHistory((prev) => {
          const next = [...prev.slice(1), info.cpu_usage];
          return next;
        });

        // Update memory
        setMemUsed(info.used_memory);
        setMemTotal(info.total_memory);

        // Update processes
        setProcessCount(info.process_count);
        const mapped: Process[] = info.processes.map((p: ProcessInfo) => ({
          name: p.name,
          pid: p.pid,
          cpu: Math.round(p.cpu * 10) / 10,
          memory: p.memory,
          status: mapStatus(p.status),
        }));
        setProcesses(mapped);
      } catch {
        // IPC not available — fall back to simulated data
        if (cancelled) return;
        setIsLive(false);

        setCpuHistory((prev) => {
          const last = prev[prev.length - 1];
          const next = clamp(last + (Math.random() - 0.45) * 15, 5, 95);
          return [...prev.slice(1), next];
        });

        setMemUsed((prev) => {
          const total = 16 * 1024;
          return clamp(prev || total * 0.5 + (Math.random() - 0.5) * 300, total * 0.25, total * 0.95);
        });
        setMemTotal(16 * 1024);
      }
    }

    fetchData();
    const timer = setInterval(fetchData, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /* Kill process (cosmetic — removes from list, re-adds after 5s) */
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

  const filteredProcesses = processes.filter(p =>
    processFilter === '' || p.name.toLowerCase().includes(processFilter.toLowerCase())
  );

  const sorted = [...filteredProcesses].sort((a, b) => {
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
  const memUsedGB = memUsed / 1024;
  const memTotalGB = memTotal / 1024;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={S.cardTitle}>CPU</span>
            {isLive && (
              <span style={S.liveIndicator}>
                <span style={S.liveDot} />
                LIVE
              </span>
            )}
          </div>
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
              {memUsedGB.toFixed(1)} GB
            </text>
            <text
              x={80}
              y={96}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={11}
            >
              of {memTotalGB.toFixed(0)} GB
            </text>
          </svg>
        </div>
      </div>

      {/* Process table */}
      <div style={S.tableCard}>
        <div style={S.tableHeader}>
          <span style={S.cardTitle}>
            Processes ({isLive ? processCount : processes.length})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="Search processes..."
              value={processFilter}
              onChange={e => setProcessFilter(e.target.value)}
              style={{ ...GLASS.inset, width: 160, padding: '4px 10px', fontSize: 11, borderRadius: 6, boxSizing: 'border-box' as const }}
            />
            {!isLive && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Simulated</span>
            )}
          </div>
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
                  key={`${p.name}-${p.pid}`}
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
