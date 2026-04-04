import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlaylistItem {
  id: string;
  title: string;
  duration: string;
  durationSec: number;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PLAYLIST: PlaylistItem[] = [
  { id: '1', title: 'Summer Memories', duration: '4:23', durationSec: 263 },
  { id: '2', title: 'Project Demo', duration: '12:05', durationSec: 725 },
  { id: '3', title: 'Tutorial Part 1', duration: '8:30', durationSec: 510 },
  { id: '4', title: 'Conference Talk', duration: '22:17', durationSec: 1337 },
  { id: '5', title: 'Product Walkthrough', duration: '6:45', durationSec: 405 },
  { id: '6', title: 'Team Standup Recap', duration: '3:12', durationSec: 192 },
];

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
    position: 'relative',
  },
  playerArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(20,20,30,0.9) 0%, rgba(10,10,20,0.95) 100%)',
    position: 'relative',
    overflow: 'hidden',
    cursor: 'default',
    minHeight: 0,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    color: 'var(--text-secondary)',
    userSelect: 'none',
  },
  playBigBtn: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '2px solid rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  controlsBar: {
    ...GLASS.elevated,
    borderRadius: 0,
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: 'none',
    padding: '8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  seekRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-secondary)',
  },
  seekBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.1)',
    position: 'relative',
    cursor: 'pointer',
  },
  seekFill: {
    height: '100%',
    borderRadius: 2,
    background: 'var(--accent-primary)',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  seekThumb: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    position: 'absolute',
    top: -4,
    transform: 'translateX(-50%)',
    boxShadow: '0 0 4px rgba(0,0,0,0.4)',
  },
  btnRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  ctrlBtn: {
    ...GLASS.ghostBtn,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 0,
    fontSize: 14,
  },
  volumeSlider: {
    width: 70,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.1)',
    position: 'relative',
    cursor: 'pointer',
  },
  speedBtn: {
    ...GLASS.ghostBtn,
    padding: '2px 8px',
    fontSize: 11,
    borderRadius: 6,
    fontFamily: 'var(--font-mono, monospace)',
    minWidth: 36,
    textAlign: 'center',
  },
  playlist: {
    ...GLASS.elevated,
    borderRadius: 0,
    borderTop: 'none',
    borderBottom: 'none',
    borderRight: 'none',
    width: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  playlistHeader: {
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  playlistItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    cursor: 'pointer',
    transition: 'background 0.12s',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  nowPlaying: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    textShadow: '0 1px 4px rgba(0,0,0,0.5)',
    zIndex: 5,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VideoPlayerApp() {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loaded, setLoaded] = useState<PlaylistItem | null>(null);
  const [volume, setVolume] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const hideTimer = useRef<number>(0);
  const tickRef = useRef<number>(0);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volBarRef = useRef<HTMLDivElement>(null);

  const duration = loaded ? loaded.durationSec : 0;

  /* Playback tick */
  useEffect(() => {
    if (playing && loaded) {
      tickRef.current = window.setInterval(() => {
        setCurrentTime((t) => {
          const next = t + speed;
          if (next >= duration) {
            setPlaying(false);
            return duration;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(tickRef.current);
  }, [playing, loaded, speed, duration]);

  /* Auto-hide controls */
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  useEffect(() => {
    return () => clearTimeout(hideTimer.current);
  }, []);

  /* Seek bar click */
  const handleSeek = (e: React.MouseEvent) => {
    if (!seekBarRef.current || !loaded) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(pct * duration);
  };

  /* Volume bar click */
  const handleVolume = (e: React.MouseEvent) => {
    if (!volBarRef.current) return;
    const rect = volBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(pct);
    if (pct > 0) setMuted(false);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const loadItem = (item: PlaylistItem) => {
    setLoaded(item);
    setCurrentTime(0);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (!loaded) {
      loadItem(PLAYLIST[0]);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const skip = (sec: number) => {
    setCurrentTime((t) => Math.max(0, Math.min(duration, t + sec)));
  };

  const toggleMute = () => setMuted((m) => !m);

  const toggleFullscreen = () => {
    const el = document.getElementById('video-player-app');
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  };

  // Keyboard shortcuts (only when video player window is focused)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const el = document.getElementById('video-player-app');
      if (!el || !el.closest('.window--focused')) return;

      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'ArrowRight': skip(10); break;
        case 'ArrowLeft': skip(-10); break;
        case 'ArrowUp': e.preventDefault(); setVolume((v) => Math.min(1, v + 0.1)); break;
        case 'ArrowDown': e.preventDefault(); setVolume((v) => Math.max(0, v - 0.1)); break;
        case 'm': case 'M': toggleMute(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const seekPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = muted ? 0 : volume * 100;

  return (
    <div id="video-player-app" style={S.root}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {/* Player */}
        <div
          style={S.playerArea}
          onMouseMove={resetHideTimer}
          onMouseEnter={resetHideTimer}
        >
          {loaded && (
            <div style={S.nowPlaying as React.CSSProperties}>{loaded.title}</div>
          )}

          {!loaded ? (
            <div style={S.placeholder as React.CSSProperties}>
              <div
                style={S.playBigBtn}
                onClick={togglePlay}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
              >
                <svg width={28} height={28} viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                No video loaded
              </span>
              <span style={{ fontSize: 12 }}>Open a video file or paste a URL to begin</span>
            </div>
          ) : (
            <div style={S.placeholder as React.CSSProperties}>
              <div
                style={S.playBigBtn}
                onClick={togglePlay}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
              >
                {playing ? (
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="white">
                    <rect x={6} y={5} width={4} height={14} rx={1} />
                    <rect x={14} y={5} width={4} height={14} rx={1} />
                  </svg>
                ) : (
                  <svg width={28} height={28} viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Controls bar */}
          <div
            style={{
              ...S.controlsBar,
              opacity: showControls ? 1 : 0,
              transform: showControls ? 'translateY(0)' : 'translateY(8px)',
              pointerEvents: showControls ? 'auto' : 'none',
            } as React.CSSProperties}
          >
            {/* Seek */}
            <div style={S.seekRow}>
              <span>{formatTime(currentTime)}</span>
              <div ref={seekBarRef} style={S.seekBar as React.CSSProperties} onClick={handleSeek}>
                <div style={{ ...S.seekFill, width: `${seekPct}%` } as React.CSSProperties} />
                <div style={{ ...S.seekThumb, left: `${seekPct}%` } as React.CSSProperties} />
              </div>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Button row */}
            <div style={S.btnRow}>
              {/* Rewind 10s */}
              <button style={S.ctrlBtn} onClick={() => skip(-10)} title="Rewind 10s">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12.5 8L7 12.5l5.5 4.5" />
                  <text x={14} y={16} fill="currentColor" stroke="none" fontSize={8} fontWeight={700}>10</text>
                </svg>
              </button>

              {/* Play/Pause */}
              <button
                style={{ ...S.ctrlBtn, ...GLASS.accentBtn, width: 36, height: 36, borderRadius: 8 }}
                onClick={togglePlay}
              >
                {playing ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                    <rect x={6} y={5} width={4} height={14} rx={1} />
                    <rect x={14} y={5} width={4} height={14} rx={1} />
                  </svg>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Forward 10s */}
              <button style={S.ctrlBtn} onClick={() => skip(10)} title="Forward 10s">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M11.5 8L17 12.5l-5.5 4.5" />
                  <text x={2} y={16} fill="currentColor" stroke="none" fontSize={8} fontWeight={700}>10</text>
                </svg>
              </button>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Volume */}
              <button
                style={{ ...S.ctrlBtn, fontSize: 16, width: 28 }}
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute' : 'Mute'}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                  {muted || volume === 0 ? (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1={18} y1={9} x2={23} y2={14} stroke="currentColor" strokeWidth={2} />
                      <line x1={23} y1={9} x2={18} y2={14} stroke="currentColor" strokeWidth={2} />
                    </>
                  ) : (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" strokeWidth={1.5} />
                      {volume >= 0.5 && (
                        <path d="M18.5 6a9 9 0 010 12" fill="none" stroke="currentColor" strokeWidth={1.5} />
                      )}
                    </>
                  )}
                </svg>
              </button>
              <div ref={volBarRef} style={S.volumeSlider as React.CSSProperties} onClick={handleVolume}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 2,
                    background: 'var(--accent-primary)',
                    width: `${volPct}%`,
                  }}
                />
              </div>

              {/* Speed */}
              <button style={S.speedBtn} onClick={cycleSpeed} title="Playback speed">
                {speed}x
              </button>

              {/* Playlist toggle */}
              <button
                style={{
                  ...S.ctrlBtn,
                  color: showPlaylist ? 'var(--accent-primary)' : undefined,
                }}
                onClick={() => setShowPlaylist((p) => !p)}
                title="Playlist"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1={3} y1={6} x2={17} y2={6} />
                  <line x1={3} y1={12} x2={14} y2={12} />
                  <line x1={3} y1={18} x2={11} y2={18} />
                  <circle cx={19} cy={15} r={3} fill="currentColor" stroke="none" />
                  <line x1={19} y1={12} x2={19} y2={9} />
                </svg>
              </button>

              {/* Fullscreen */}
              <button style={S.ctrlBtn} title="Fullscreen (F)" onClick={toggleFullscreen}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Playlist sidebar */}
        {showPlaylist && (
          <div style={S.playlist as React.CSSProperties}>
            <div style={S.playlistHeader}>Playlist</div>
            <div style={{ ...GLASS.scrollList, flex: 1 }}>
              {PLAYLIST.map((item) => (
                <div
                  key={item.id}
                  style={{
                    ...S.playlistItem,
                    background: loaded?.id === item.id ? GLASS.selectedBg : 'transparent',
                  }}
                  onClick={() => loadItem(item)}
                  onMouseEnter={(e) => {
                    if (loaded?.id !== item.id)
                      (e.currentTarget as HTMLElement).style.background = GLASS.hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      loaded?.id === item.id ? GLASS.selectedBg : 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: loaded?.id === item.id ? 600 : 400,
                        color: loaded?.id === item.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {item.duration}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoPlayerApp;
