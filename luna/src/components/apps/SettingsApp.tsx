import React, { useState, useMemo } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Section = 'appearance' | 'display' | 'sound' | 'notifications' | 'about';

interface NotificationSetting {
  key: string;
  label: string;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: 'appearance',    label: 'Appearance',    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { key: 'display',       label: 'Display',       icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'sound',         label: 'Sound',         icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z' },
  { key: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { key: 'about',         label: 'About',         icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const ACCENT_COLORS = [
  { name: 'Blue',   value: '#7eb8ff' },
  { name: 'Amber',  value: '#fbbf24' },
  { name: 'Green',  value: '#4ade80' },
  { name: 'Pink',   value: '#f472b6' },
  { name: 'Purple', value: '#a78bfa' },
  { name: 'Teal',   value: '#2dd4bf' },
];

const WALLPAPERS = [
  { name: 'Deep Ocean',   gradient: 'linear-gradient(135deg, #0c1929 0%, #1a3a5c 50%, #0d2137 100%)' },
  { name: 'Dusk',         gradient: 'linear-gradient(135deg, #1a1025 0%, #2d1b3d 40%, #4a2040 100%)' },
  { name: 'Forest',       gradient: 'linear-gradient(135deg, #0a1a0f 0%, #1a3320 50%, #0f2616 100%)' },
  { name: 'Midnight',     gradient: 'linear-gradient(135deg, #0a0a14 0%, #151528 50%, #1a1a2e 100%)' },
];

const THEME_OPTIONS = ['Dark', 'Light', 'System'] as const;
const TEXT_SIZES = ['Small', 'Medium', 'Large'] as const;

const BOOT_TIME = Date.now() - 3 * 3600000 - 27 * 60000; // 3h 27m ago

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
    flexDirection: 'row' as const,
  },
  sidebar: {
    ...GLASS.elevated,
    width: 180,
    flexShrink: 0,
    borderRight: `1px solid ${GLASS.dividerColor}`,
    borderTop: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px 0',
    overflowY: 'auto' as const,
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 16px',
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    textAlign: 'left' as const,
    fontFamily: 'var(--font-ui)',
    width: '100%',
    transition: 'background 0.15s ease',
  },
  sidebarItemActive: {
    background: GLASS.selectedBg,
    color: 'var(--accent-primary)',
  },
  main: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px 24px',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-tertiary)',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  /* Segmented control */
  segmented: {
    display: 'inline-flex',
    gap: 2,
    padding: 2,
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
  segBtn: {
    ...GLASS.tab,
    padding: '6px 16px',
    fontSize: 12,
    borderRadius: 6,
  },
  segBtnActive: {
    ...GLASS.tabActive,
    padding: '6px 16px',
    fontSize: 12,
    borderRadius: 6,
  },
  /* Color swatches */
  swatchRow: {
    display: 'flex',
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, transform 0.15s ease',
  },
  swatchSelected: {
    borderColor: '#fff',
    transform: 'scale(1.1)',
  },
  /* Wallpaper grid */
  wallpaperGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  wallpaperThumb: {
    height: 72,
    borderRadius: 8,
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.15s ease',
  },
  wallpaperSelected: {
    borderColor: 'var(--accent-primary)',
  },
  wallpaperLabel: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginTop: 4,
  },
  /* Slider */
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 4,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as any,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 9999,
    outline: 'none',
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    minWidth: 40,
    textAlign: 'right' as const,
  },
  /* Toggle row */
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  toggleLabel: {
    fontSize: 13,
    color: 'var(--text-primary)',
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
  /* About */
  aboutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  aboutLabel: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  aboutValue: {
    fontSize: 13,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  storageBar: {
    height: 12,
    borderRadius: 9999,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginTop: 8,
  },
  storageFill: {
    height: '100%',
    borderRadius: 9999,
    transition: 'width 0.3s ease',
  },
  storageLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
};

/* ------------------------------------------------------------------ */
/*  Toggle component                                                   */
/* ------------------------------------------------------------------ */

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      style={{
        ...S.toggle,
        background: on ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
      }}
      onClick={onToggle}
    >
      <div style={{
        ...S.toggleKnob,
        left: on ? 18 : 2,
      }} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Appearance                                                */
/* ------------------------------------------------------------------ */

function AppearanceSection({
  theme, setTheme, accentColor, setAccentColor, wallpaper, setWallpaper,
}: {
  theme: string; setTheme: (t: string) => void;
  accentColor: string; setAccentColor: (c: string) => void;
  wallpaper: number; setWallpaper: (w: number) => void;
}) {
  return (
    <div>
      <div style={S.sectionTitle}>Appearance</div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Theme</div>
        <div style={S.segmented}>
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt}
              style={theme === opt ? S.segBtnActive : S.segBtn}
              onClick={() => setTheme(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Accent Color</div>
        <div style={S.swatchRow}>
          {ACCENT_COLORS.map(c => (
            <div
              key={c.value}
              title={c.name}
              style={{
                ...S.swatch,
                background: c.value,
                ...(accentColor === c.value ? S.swatchSelected : {}),
              }}
              onClick={() => setAccentColor(c.value)}
            />
          ))}
        </div>
      </div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Wallpaper</div>
        <div style={S.wallpaperGrid}>
          {WALLPAPERS.map((w, i) => (
            <div key={i}>
              <div
                style={{
                  ...S.wallpaperThumb,
                  background: w.gradient,
                  ...(wallpaper === i ? S.wallpaperSelected : {}),
                }}
                onClick={() => setWallpaper(i)}
              />
              <div style={S.wallpaperLabel}>{w.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Display                                                   */
/* ------------------------------------------------------------------ */

function DisplaySection({
  scale, setScale, textSize, setTextSize,
}: {
  scale: number; setScale: (s: number) => void;
  textSize: string; setTextSize: (t: string) => void;
}) {
  return (
    <div>
      <div style={S.sectionTitle}>Display</div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Scale</div>
        <div style={S.sliderRow}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>80%</span>
          <input
            type="range"
            min={80}
            max={120}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            style={S.slider}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>120%</span>
          <span style={S.sliderValue}>{scale}%</span>
        </div>
      </div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Text Size</div>
        <div style={S.segmented}>
          {TEXT_SIZES.map(sz => (
            <button
              key={sz}
              style={textSize === sz ? S.segBtnActive : S.segBtn}
              onClick={() => setTextSize(sz)}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Sound                                                     */
/* ------------------------------------------------------------------ */

function SoundSection({
  volume, setVolume, alertSounds, setAlertSounds, notifSounds, setNotifSounds,
}: {
  volume: number; setVolume: (v: number) => void;
  alertSounds: boolean; setAlertSounds: (b: boolean) => void;
  notifSounds: boolean; setNotifSounds: (b: boolean) => void;
}) {
  return (
    <div>
      <div style={S.sectionTitle}>Sound</div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Master Volume</div>
        <div style={S.sliderRow}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
          </svg>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            style={S.slider}
          />
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
          </svg>
          <span style={S.sliderValue}>{volume}%</span>
        </div>
      </div>

      <div style={S.fieldGroup}>
        <div style={S.toggleRow}>
          <span style={S.toggleLabel}>Alert sounds</span>
          <Toggle on={alertSounds} onToggle={() => setAlertSounds(!alertSounds)} />
        </div>
        <div style={S.toggleRow}>
          <span style={S.toggleLabel}>Notification sounds</span>
          <Toggle on={notifSounds} onToggle={() => setNotifSounds(!notifSounds)} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: Notifications                                             */
/* ------------------------------------------------------------------ */

function NotificationsSection({
  settings, toggle,
}: {
  settings: NotificationSetting[];
  toggle: (key: string) => void;
}) {
  return (
    <div>
      <div style={S.sectionTitle}>Notifications</div>

      <div style={S.fieldGroup}>
        {settings.map(s => (
          <div key={s.key} style={S.toggleRow}>
            <span style={S.toggleLabel}>{s.label}</span>
            <Toggle on={s.enabled} onToggle={() => toggle(s.key)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section: About                                                     */
/* ------------------------------------------------------------------ */

function AboutSection() {
  const uptime = useMemo(() => {
    const ms = Date.now() - BOOT_TIME;
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }, []);

  const usedGB = 45;
  const totalGB = 256;
  const pct = (usedGB / totalGB) * 100;

  return (
    <div>
      <div style={S.sectionTitle}>About</div>

      <div style={S.fieldGroup}>
        <div style={S.aboutRow}>
          <span style={S.aboutLabel}>Version</span>
          <span style={S.aboutValue}>Luna OS v0.1.0</span>
        </div>
        <div style={S.aboutRow}>
          <span style={S.aboutLabel}>Build</span>
          <span style={S.aboutValue}>AI-native desktop environment</span>
        </div>
        <div style={S.aboutRow}>
          <span style={S.aboutLabel}>Uptime</span>
          <span style={S.aboutValue}>{uptime}</span>
        </div>
      </div>

      <div style={S.fieldGroup}>
        <div style={S.fieldLabel}>Storage</div>
        <div style={S.storageBar}>
          <div
            style={{
              ...S.storageFill,
              width: `${pct}%`,
              background: pct > 80
                ? 'linear-gradient(90deg, #f87171, #ef4444)'
                : 'linear-gradient(90deg, var(--accent-primary), #5b9eff)',
            }}
          />
        </div>
        <div style={S.storageLabels}>
          <span>{usedGB} GB used</span>
          <span>{totalGB - usedGB} GB available</span>
        </div>
      </div>

      <div style={{ marginTop: 32, padding: '16px 0', borderTop: `1px solid ${GLASS.dividerColor}` }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          Luna OS is an AI-native desktop environment<br />
          designed for human-AI collaboration.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar Icon                                                       */
/* ------------------------------------------------------------------ */

function SideIcon({ d }: { d: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function SettingsApp() {
  const [section, setSection] = useState<Section>('appearance');

  // Appearance state
  const [theme, setTheme] = useState('Dark');
  const [accentColor, setAccentColor] = useState('#7eb8ff');
  const [wallpaper, setWallpaper] = useState(0);

  // Display state
  const [scale, setScale] = useState(100);
  const [textSize, setTextSize] = useState('Medium');

  // Sound state
  const [volume, setVolume] = useState(75);
  const [alertSounds, setAlertSounds] = useState(true);
  const [notifSounds, setNotifSounds] = useState(true);

  // Notifications state
  const [notifSettings, setNotifSettings] = useState<NotificationSetting[]>([
    { key: 'messages',    label: 'Messages',    enabled: true },
    { key: 'calendar',    label: 'Calendar',    enabled: true },
    { key: 'email',       label: 'Email',       enabled: true },
    { key: 'reminders',   label: 'Reminders',   enabled: false },
    { key: 'system',      label: 'System',      enabled: true },
  ]);

  const toggleNotif = (key: string) => {
    setNotifSettings(prev =>
      prev.map(s => s.key === key ? { ...s, enabled: !s.enabled } : s)
    );
  };

  return (
    <div style={S.root}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            style={{
              ...S.sidebarItem,
              ...(section === s.key ? S.sidebarItemActive : {}),
            }}
            onClick={() => setSection(s.key)}
          >
            <SideIcon d={s.icon} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={S.main}>
        {section === 'appearance' && (
          <AppearanceSection
            theme={theme} setTheme={setTheme}
            accentColor={accentColor} setAccentColor={setAccentColor}
            wallpaper={wallpaper} setWallpaper={setWallpaper}
          />
        )}
        {section === 'display' && (
          <DisplaySection
            scale={scale} setScale={setScale}
            textSize={textSize} setTextSize={setTextSize}
          />
        )}
        {section === 'sound' && (
          <SoundSection
            volume={volume} setVolume={setVolume}
            alertSounds={alertSounds} setAlertSounds={setAlertSounds}
            notifSounds={notifSounds} setNotifSounds={setNotifSounds}
          />
        )}
        {section === 'notifications' && (
          <NotificationsSection settings={notifSettings} toggle={toggleNotif} />
        )}
        {section === 'about' && <AboutSection />}
      </div>
    </div>
  );
}

export default SettingsApp;
