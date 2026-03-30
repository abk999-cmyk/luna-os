import type { CSSProperties } from 'react';

/**
 * Shared glass-morphism inline style fragments for Luna OS apps.
 * Spread into style objects: `style={{ ...GLASS.surface, display: 'flex' }}`
 */

/** Base glass surface — main content areas */
const surface: CSSProperties = {
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturation))',
  WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturation))',
  border: '1px solid var(--glass-edge-light)',
};

/** Elevated glass — sidebars, panels, toolbars */
const elevated: CSSProperties = {
  background: 'var(--glass-bg-elevated)',
  backdropFilter: 'blur(var(--glass-blur-heavy)) saturate(var(--glass-saturation))',
  WebkitBackdropFilter: 'blur(var(--glass-blur-heavy)) saturate(var(--glass-saturation))',
  border: '1px solid var(--glass-edge-light)',
};

/** Inset/recessed — inputs, editors, code blocks */
const inset: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  outline: 'none',
};

/** Primary accent button */
const accentBtn: CSSProperties = {
  background: 'var(--accent-primary)',
  color: '#000',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s ease',
};

/** Subtle glass button — toolbars, secondary actions */
const ghostBtn: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  transition: 'background 0.15s ease, color 0.15s ease',
};

/** Tab/segmented control — inactive */
const tab: CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  fontWeight: 500,
  padding: '5px 10px',
  transition: 'all 0.15s ease',
};

/** Tab/segmented control — active */
const tabActive: CSSProperties = {
  ...tab,
  background: 'rgba(126, 184, 255, 0.12)',
  color: 'var(--accent-primary)',
};

export const GLASS = {
  surface,
  elevated,
  inset,
  accentBtn,
  ghostBtn,
  tab,
  tabActive,

  // Semantic colors for interaction states
  hoverBg: 'rgba(255, 255, 255, 0.06)',
  activeBg: 'rgba(255, 255, 255, 0.10)',
  selectedBg: 'rgba(126, 184, 255, 0.12)',
  selectedBorder: 'rgba(126, 184, 255, 0.3)',
  dividerColor: 'rgba(255, 255, 255, 0.06)',
  accentColor: 'var(--accent-primary)',

  // Transparent app root — lets window glass show through
  appRoot: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    overflow: 'hidden',
  } as CSSProperties,

  // Scrollable list area
  scrollList: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  } as CSSProperties,
} as const;
