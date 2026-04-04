import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { GLASS } from './glassStyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Photo {
  id: number;
  hue: number;
  width: number;
  height: number;
  size: string;
  date: string;
  favorited: boolean;
}

export interface PhotosAppProps {
  photos?: Photo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePhotos(count: number): Photo[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const hue = (i * 37) % 360;
    const w = [3000, 4000, 4500, 5000, 3200, 4800][i % 6];
    const h = [2000, 3000, 3000, 3750, 2400, 3200][i % 6];
    const mb = (2 + ((i * 13) % 60) / 10).toFixed(1);
    const daysAgo = (i * 3 + (i * 7) % 11);
    const d = new Date(now - daysAgo * 86400000);
    return {
      id: i,
      hue,
      width: w,
      height: h,
      size: `${mb} MB`,
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      favorited: false,
    };
  });
}

function photoGradient(hue: number): string {
  const h2 = (hue + 40) % 360;
  const h3 = (hue + 160) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 60%, 45%) 0%, hsl(${h2}, 50%, 35%) 50%, hsl(${h3}, 40%, 30%) 100%)`;
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? '#ef4444' : 'none'}
    stroke={filled ? '#ef4444' : 'rgba(255,255,255,0.8)'} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ChevronLeft = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhotosApp({ photos: initialPhotos }: PhotosAppProps) {
  const [photos, setPhotos] = useState<Photo[]>(() => initialPhotos || generatePhotos(24));
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkFavorite = useCallback(() => {
    setPhotos(prev => prev.map(p => selectedPhotos.has(p.id) ? { ...p, favorited: true } : p));
    setSelectedPhotos(new Set());
    setSelectMode(false);
  }, [selectedPhotos]);

  const bulkDelete = useCallback(() => {
    setPhotos(prev => prev.filter(p => !selectedPhotos.has(p.id)));
    setSelectedPhotos(new Set());
    setSelectMode(false);
  }, [selectedPhotos]);

  const filtered = useMemo(() => {
    if (filter === 'favorites') return photos.filter(p => p.favorited);
    return photos;
  }, [photos, filter]);

  const toggleFav = useCallback((id: number, e?: React.MouseEvent) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, favorited: !p.favorited } : p));
  }, []);

  const openLightbox = useCallback((idx: number) => setLightboxIdx(idx), []);
  const closeLightbox = useCallback(() => { setLightboxIdx(null); setShowInfo(false); }, []);

  const goNext = useCallback(() => {
    setLightboxIdx(prev => prev !== null ? (prev + 1) % filtered.length : null);
  }, [filtered.length]);

  const goPrev = useCallback(() => {
    setLightboxIdx(prev => prev !== null ? (prev - 1 + filtered.length) % filtered.length : null);
  }, [filtered.length]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, closeLightbox, goNext, goPrev]);

  const currentPhoto = lightboxIdx !== null ? filtered[lightboxIdx] : null;

  return (
    <div style={{ ...GLASS.appRoot }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: `1px solid ${GLASS.dividerColor}`,
      }}>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
          <button
            onClick={() => setFilter('all')}
            style={{ ...(filter === 'all' ? GLASS.tabActive : GLASS.tab), padding: '5px 14px' }}
          >All</button>
          <button
            onClick={() => setFilter('favorites')}
            style={{ ...(filter === 'favorites' ? GLASS.tabActive : GLASS.tab), padding: '5px 14px' }}
          >Favorites</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectMode && selectedPhotos.size > 0 && (
            <>
              <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                {selectedPhotos.size} selected
              </span>
              <button
                onClick={bulkFavorite}
                style={{
                  ...GLASS.ghostBtn, padding: '4px 10px', fontSize: 11, borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <HeartIcon filled={false} /> Favorite
              </button>
              <button
                onClick={bulkDelete}
                style={{
                  ...GLASS.ghostBtn, padding: '4px 10px', fontSize: 11, borderRadius: 6,
                  color: '#ef4444',
                }}
              >
                Delete
              </button>
            </>
          )}
          {!selectMode && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {filtered.length} photo{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => { setSelectMode(m => !m); setSelectedPhotos(new Set()); }}
            style={{
              ...(selectMode ? GLASS.tabActive : GLASS.tab),
              padding: '4px 10px', fontSize: 11, borderRadius: 6,
            }}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ ...GLASS.scrollList, padding: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
        }}>
          {filtered.map((photo, idx) => {
            const hovered = hoveredId === photo.id;
            return (
              <div
                key={photo.id}
                onClick={() => selectMode ? toggleSelect(photo.id) : openLightbox(idx)}
                onMouseEnter={() => setHoveredId(photo.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: photoGradient(photo.hue),
                  border: selectedPhotos.has(photo.id)
                    ? '2px solid var(--accent-primary)'
                    : hovered ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.04)',
                  transition: 'border 0.15s ease, transform 0.15s ease',
                  transform: hovered ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                {/* Selection checkbox overlay */}
                {selectMode && (
                  <div
                    style={{
                      position: 'absolute', top: 8, left: 8,
                      width: 22, height: 22, borderRadius: 6,
                      background: selectedPhotos.has(photo.id) ? 'var(--accent-primary)' : 'rgba(0,0,0,0.4)',
                      border: selectedPhotos.has(photo.id) ? 'none' : '2px solid rgba(255,255,255,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 2,
                    }}
                  >
                    {selectedPhotos.has(photo.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                )}
                {/* Favorite overlay */}
                {!selectMode && (hovered || photo.favorited) && (
                  <div
                    onClick={(e) => toggleFav(photo.id, e)}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 30, height: 30, borderRadius: 8,
                      background: 'rgba(0,0,0,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: hovered || photo.favorited ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    <HeartIcon filled={photo.favorited} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'left', color: 'var(--text-secondary)', padding: '40px 0', fontSize: 13 }}>
            {filter === 'favorites' ? 'No favorites yet. Click the heart on a photo to favorite it.' : 'No photos.'}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && currentPhoto && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            style={{
              position: 'absolute', top: 16, right: showInfo ? 276 : 16, zIndex: 102,
              ...GLASS.ghostBtn, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, borderRadius: 8,
              transition: 'right 0.2s ease, background 0.15s ease',
            }}
          ><CloseIcon /></button>

          {/* Info toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowInfo(s => !s); }}
            style={{
              position: 'absolute', top: 16, right: showInfo ? 316 : 56, zIndex: 102,
              ...GLASS.ghostBtn, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, borderRadius: 8,
              color: showInfo ? 'var(--accent-primary)' : 'var(--text-secondary)',
              transition: 'right 0.2s ease, background 0.15s ease, color 0.15s ease',
            }}
          ><InfoIcon /></button>

          {/* Counter */}
          <div style={{
            position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, zIndex: 102,
          }}>
            {lightboxIdx + 1} / {filtered.length}
          </div>

          {/* Prev */}
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              ...GLASS.ghostBtn, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, borderRadius: 22, zIndex: 102,
            }}
          ><ChevronLeft /></button>

          {/* Next */}
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            style={{
              position: 'absolute', right: showInfo ? 276 : 16, top: '50%', transform: 'translateY(-50%)',
              ...GLASS.ghostBtn, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, borderRadius: 22, zIndex: 102,
              transition: 'right 0.2s ease',
            }}
          ><ChevronRight /></button>

          {/* Photo */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '65%', maxWidth: 700, aspectRatio: `${currentPhoto.width}/${currentPhoto.height}`,
              maxHeight: '75vh', borderRadius: 12,
              background: photoGradient(currentPhoto.hue),
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              marginRight: showInfo ? 260 : 0,
              transition: 'margin-right 0.2s ease',
            }}
          />

          {/* Favorite in lightbox */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFav(currentPhoto.id); }}
            style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              ...GLASS.ghostBtn, display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, zIndex: 102,
              marginRight: showInfo ? 260 : 0,
              transition: 'margin-right 0.2s ease',
            }}
          >
            <HeartIcon filled={currentPhoto.favorited} />
            <span style={{ fontSize: 12 }}>{currentPhoto.favorited ? 'Favorited' : 'Favorite'}</span>
          </button>

          {/* Info Panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 260,
              ...GLASS.elevated,
              borderLeft: `1px solid ${GLASS.dividerColor}`,
              borderRadius: 0,
              padding: '60px 20px 20px',
              transform: showInfo ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.2s ease',
              overflowY: 'auto',
              zIndex: 101,
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <div style={{
                width: '100%', aspectRatio: `${currentPhoto.width}/${currentPhoto.height}`,
                maxHeight: 140, borderRadius: 8,
                background: photoGradient(currentPhoto.hue),
              }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              Details
            </h3>
            {[
              ['Dimensions', `${currentPhoto.width} x ${currentPhoto.height}`],
              ['Date', currentPhoto.date],
              ['File Size', currentPhoto.size],
              ['Format', 'JPEG'],
              ['Color Space', 'sRGB'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: `1px solid ${GLASS.dividerColor}`,
              }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotosApp;
