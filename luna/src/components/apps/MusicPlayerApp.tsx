import React, { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  albumArt?: string;
}

interface MusicPlayerProps {
  playlist?: Song[];
  currentIndex?: number;
  isPlaying?: boolean;
  volume?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const DEFAULT_PLAYLIST: Song[] = [
  { id: '1', title: 'Midnight Echoes', artist: 'Lunar Drift', album: 'Nocturnal', duration: 234 },
  { id: '2', title: 'Golden Hour', artist: 'Amber Light', album: 'Warmth', duration: 198 },
  { id: '3', title: 'Starfall', artist: 'Cosmica', album: 'Orbit', duration: 267 },
  { id: '4', title: 'Deep Current', artist: 'Tidal Force', album: 'Depths', duration: 312 },
  { id: '5', title: 'Ember Glow', artist: 'Flame Theory', album: 'Ignition', duration: 185 },
  { id: '6', title: 'Silent Waves', artist: 'Oceanic', album: 'Blue', duration: 245 },
  { id: '7', title: 'Neon Dreams', artist: 'Synthwave Collective', album: 'Retrograde', duration: 208 },
  { id: '8', title: 'Mountain Air', artist: 'Alpine Echo', album: 'Summit', duration: 276 },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--surface-base, #1a1614)',
    color: 'var(--text-primary, #e8e0d8)',
    fontFamily: 'var(--font-system, system-ui)',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid var(--border-subtle, #3a332e)',
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  // Now Playing Panel (left)
  nowPlaying: {
    width: 280,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRight: '1px solid var(--border-subtle, #3a332e)',
    background: 'var(--surface-elevated, #2a2420)',
    gap: 16,
  },
  albumArt: {
    width: 180,
    height: 180,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(212,165,116,0.2) 0%, rgba(90,70,55,0.3) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 64,
    color: 'var(--color-accent, #d4a574)',
    border: '1px solid var(--border-subtle, #3a332e)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  albumImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  songTitle: {
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  songArtist: {
    fontSize: 13,
    color: 'var(--text-secondary, #b0a898)',
    textAlign: 'center',
    marginTop: -8,
  },
  songAlbum: {
    fontSize: 12,
    color: 'var(--text-tertiary, #6a6058)',
    textAlign: 'center',
    marginTop: -10,
  },
  // Progress
  progressContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  progressBar: {
    width: '100%',
    height: 4,
    background: 'var(--border-subtle, #3a332e)',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-accent, #d4a574)',
    borderRadius: 2,
    position: 'relative',
  },
  progressThumb: {
    position: 'absolute',
    right: -6,
    top: -4,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'var(--color-accent, #d4a574)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },
  progressTimes: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'var(--text-tertiary, #6a6058)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  // Controls
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  controlBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary, #b0a898)',
    fontSize: 18,
    cursor: 'pointer',
    padding: 6,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-system, system-ui)',
    transition: 'color 0.15s',
  },
  playBtn: {
    background: 'var(--color-accent, #d4a574)',
    color: '#1a1614',
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-system, system-ui)',
    flexShrink: 0,
  },
  controlActive: {
    color: 'var(--color-accent, #d4a574)',
  },
  // Volume
  volumeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  volumeIcon: {
    fontSize: 16,
    color: 'var(--text-secondary, #b0a898)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font-system, system-ui)',
  },
  volumeSlider: {
    flex: 1,
    height: 4,
    background: 'var(--border-subtle, #3a332e)',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  // Playlist / Queue (right)
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  tabRow: {
    display: 'flex',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    flexShrink: 0,
  },
  panelTab: {
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-secondary, #b0a898)',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'var(--font-system, system-ui)',
    textAlign: 'center',
  },
  panelTabActive: {
    borderBottomColor: 'var(--color-accent, #d4a574)',
    color: 'var(--color-accent, #d4a574)',
  },
  songList: {
    flex: 1,
    overflowY: 'auto',
  },
  songItem: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr auto 40px',
    gap: 10,
    alignItems: 'center',
    padding: '8px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    transition: 'background 0.1s',
  },
  songItemActive: {
    background: 'rgba(212,165,116,0.10)',
  },
  songIdx: {
    fontSize: 12,
    color: 'var(--text-tertiary, #6a6058)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono, monospace)',
  },
  songInfo: {
    overflow: 'hidden',
  },
  songInfoTitle: {
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  songInfoArtist: {
    fontSize: 12,
    color: 'var(--text-secondary, #b0a898)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  songDuration: {
    fontSize: 12,
    color: 'var(--text-tertiary, #6a6058)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  likeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    cursor: 'pointer',
    padding: 2,
    color: 'var(--text-tertiary, #6a6058)',
    fontFamily: 'var(--font-system, system-ui)',
  },
  likeBtnActive: {
    color: '#e05252',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MusicPlayerApp({
  playlist: plProp,
  currentIndex: idxProp = 0,
  isPlaying: playProp = false,
  volume: volProp = 80,
}: MusicPlayerProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalProps = useRef<string>(JSON.stringify({ plProp, idxProp, playProp, volProp }));

  const [playlist, setPlaylist] = useState<Song[]>(plProp ?? DEFAULT_PLAYLIST);
  const [currentIdx, setCurrentIdx] = useState(idxProp);
  const [playing, setPlaying] = useState(playProp);
  const [volume, setVolume] = useState(volProp);
  const [progress, setProgress] = useState(0); // 0-1
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [panelTab, setPanelTab] = useState<'playlist' | 'queue'>('playlist');
  const [queue, setQueue] = useState<Song[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify({ plProp, idxProp, playProp, volProp });
    if (serialized === lastExternalProps.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalProps.current = serialized;
    if (plProp) setPlaylist(plProp);
    setCurrentIdx(idxProp);
    setPlaying(playProp);
    setVolume(volProp);
  }, [plProp, idxProp, playProp, volProp]);

  const current = playlist[currentIdx] ?? playlist[0];

  // Simulate playback progress
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (playing && current) {
      timerRef.current = setInterval(() => {
        setProgress(prev => {
          const next = prev + 1 / current.duration;
          if (next >= 1) {
            handleNext();
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = useCallback(() => {
    if (repeat === 'one') { setProgress(0); return; }
    if (shuffle) {
      let next: number;
      do { next = Math.floor(Math.random() * playlist.length); } while (next === currentIdx && playlist.length > 1);
      setCurrentIdx(next);
    } else {
      setCurrentIdx(prev => {
        if (prev >= playlist.length - 1) return repeat === 'all' ? 0 : prev;
        return prev + 1;
      });
    }
    setProgress(0);
  }, [currentIdx, playlist.length, repeat, shuffle]);

  const handlePrev = useCallback(() => {
    if (progress > 0.05) {
      setProgress(0);
      return;
    }
    setCurrentIdx(prev => (prev <= 0 ? playlist.length - 1 : prev - 1));
    setProgress(0);
  }, [progress, playlist.length]);

  const togglePlay = useCallback(() => { isInternalEdit.current = true; setPlaying(p => !p); }, []);

  const toggleLike = useCallback((id: string) => {
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off');
  }, []);

  // Progress bar drag
  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    if (!progressRef.current || !current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(ratio);
  }, [current]);

  // Volume slider click
  const handleVolumeClick = useCallback((e: React.MouseEvent) => {
    if (!volumeRef.current) return;
    isInternalEdit.current = true;
    const rect = volumeRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setVolume(Math.round(ratio));
  }, []);

  const repeatLabel = repeat === 'off' ? '\u{1F501}' : repeat === 'all' ? '\u{1F501}' : '\u{1F502}';

  return (
    <div style={S.root}>
      <div style={S.body}>
        {/* Now Playing */}
        <div style={S.nowPlaying}>
          <div style={S.albumArt}>
            {current?.albumArt ? (
              <img src={current.albumArt} alt={current.album} style={S.albumImg as React.CSSProperties} />
            ) : (
              '\u266b'
            )}
          </div>

          <div style={S.songTitle}>{current?.title ?? 'No track'}</div>
          <div style={S.songArtist}>{current?.artist ?? '--'}</div>
          <div style={S.songAlbum}>{current?.album ?? '--'}</div>

          {/* Progress */}
          <div style={S.progressContainer}>
            <div style={S.progressBar} ref={progressRef} onClick={handleProgressClick}>
              <div style={{ ...S.progressFill, width: `${progress * 100}%` }}>
                <div style={S.progressThumb as React.CSSProperties} />
              </div>
            </div>
            <div style={S.progressTimes}>
              <span>{current ? formatTime(progress * current.duration) : '0:00'}</span>
              <span>{current ? formatTime(current.duration) : '0:00'}</span>
            </div>
          </div>

          {/* Controls */}
          <div style={S.controls}>
            <button
              style={{ ...S.controlBtn, ...(shuffle ? S.controlActive : {}) }}
              onClick={() => setShuffle(s => !s)}
              title="Shuffle"
            >
              {'\u{1F500}'}
            </button>
            <button style={S.controlBtn} onClick={handlePrev} title="Previous">
              \u23ee
            </button>
            <button style={S.playBtn} onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
              {playing ? '\u23f8' : '\u25b6'}
            </button>
            <button style={S.controlBtn} onClick={handleNext} title="Next">
              \u23ed
            </button>
            <button
              style={{ ...S.controlBtn, ...(repeat !== 'off' ? S.controlActive : {}) }}
              onClick={cycleRepeat}
              title={`Repeat: ${repeat}`}
            >
              {repeatLabel}
            </button>
          </div>

          {/* Like button for current track */}
          {current && (
            <button
              style={{ ...S.likeBtn, ...(liked.has(current.id) ? S.likeBtnActive : {}), fontSize: 22 }}
              onClick={() => toggleLike(current.id)}
            >
              {liked.has(current.id) ? '\u2764\ufe0f' : '\u2661'}
            </button>
          )}

          {/* Volume */}
          <div style={S.volumeRow}>
            <button
              style={S.volumeIcon}
              onClick={() => setVolume(v => v > 0 ? 0 : 80)}
            >
              {volume === 0 ? '\u{1F507}' : volume < 40 ? '\u{1F508}' : '\u{1F50A}'}
            </button>
            <div style={S.volumeSlider} ref={volumeRef} onClick={handleVolumeClick}>
              <div
                style={{
                  height: '100%',
                  width: `${volume}%`,
                  background: 'var(--color-accent, #d4a574)',
                  borderRadius: 2,
                  position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute',
                  right: -5,
                  top: -3,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--color-accent, #d4a574)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                } as React.CSSProperties} />
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #6a6058)', fontFamily: 'var(--font-mono, monospace)', minWidth: 28, textAlign: 'right' }}>
              {volume}%
            </span>
          </div>
        </div>

        {/* Right Panel - Playlist / Queue */}
        <div style={S.rightPanel}>
          <div style={S.tabRow}>
            <button
              style={{ ...S.panelTab, ...(panelTab === 'playlist' ? S.panelTabActive : {}) }}
              onClick={() => setPanelTab('playlist')}
            >
              Playlist ({playlist.length})
            </button>
            <button
              style={{ ...S.panelTab, ...(panelTab === 'queue' ? S.panelTabActive : {}) }}
              onClick={() => setPanelTab('queue')}
            >
              Queue ({queue.length})
            </button>
          </div>

          <div style={S.songList}>
            {panelTab === 'playlist'
              ? playlist.map((song, i) => (
                  <div
                    key={song.id}
                    style={{
                      ...S.songItem,
                      ...(i === currentIdx ? S.songItemActive : {}),
                    }}
                    onClick={() => { setCurrentIdx(i); setProgress(0); setPlaying(true); }}
                    onMouseEnter={e => { if (i !== currentIdx) e.currentTarget.style.background = 'rgba(212,165,116,0.05)'; }}
                    onMouseLeave={e => { if (i !== currentIdx) e.currentTarget.style.background = 'none'; }}
                  >
                    <span style={S.songIdx}>
                      {i === currentIdx && playing ? '\u266b' : i + 1}
                    </span>
                    <div style={S.songInfo}>
                      <div style={{
                        ...S.songInfoTitle,
                        ...(i === currentIdx ? { color: 'var(--color-accent, #d4a574)' } : {}),
                      }}>
                        {song.title}
                      </div>
                      <div style={S.songInfoArtist}>{song.artist} \u00b7 {song.album}</div>
                    </div>
                    <span style={S.songDuration}>{formatTime(song.duration)}</span>
                    <button
                      style={{ ...S.likeBtn, ...(liked.has(song.id) ? S.likeBtnActive : {}) }}
                      onClick={e => { e.stopPropagation(); toggleLike(song.id); }}
                    >
                      {liked.has(song.id) ? '\u2764\ufe0f' : '\u2661'}
                    </button>
                  </div>
                ))
              : queue.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary, #6a6058)' }}>
                    Queue is empty. Right-click songs to add them.
                  </div>
                ) : queue.map((song, i) => (
                  <div
                    key={`q-${song.id}-${i}`}
                    style={S.songItem}
                  >
                    <span style={S.songIdx}>{i + 1}</span>
                    <div style={S.songInfo}>
                      <div style={S.songInfoTitle}>{song.title}</div>
                      <div style={S.songInfoArtist}>{song.artist}</div>
                    </div>
                    <span style={S.songDuration}>{formatTime(song.duration)}</span>
                    <button
                      style={S.likeBtn}
                      onClick={() => setQueue(q => q.filter((_, qi) => qi !== i))}
                      title="Remove from queue"
                    >
                      \u00d7
                    </button>
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export default MusicPlayerApp;
