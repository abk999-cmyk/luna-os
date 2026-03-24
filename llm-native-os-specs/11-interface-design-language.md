# 11. Interface Design Language — LLM-Native OS

**Document Type:** Visual System & Style Guide
**Status:** Self-contained spec for implementation
**Audience:** Claude Code, frontend developers, design implementors

---

## 1. Design Philosophy

The interface embodies **active agent orchestration** — users observe and guide distributed AI work in progress. The visual language derives from **warm, collaborative workspace aesthetics** (well-worn wooden desk, worn leather journals) rather than cold corporate tools or spaceship cockpits.

**Core principles:**
- Warm, grounded aesthetic signals trust and collaboration
- Progressive disclosure: surface what's needed, complexity on demand
- Visual hierarchy through magnetic attachment and window positioning
- Live transparency: users see agents actively working, can reach in to steer
- Calm and focused: never overwhelming, never clinical

---

## 2. Color System

### 2.1 Primary Palette (All hex values sRGB)

```css
:root {
  /* Warm Sand/Clay — Foundation */
  --color-sand-50: #faf7f2;
  --color-sand-100: #f5f0e8;
  --color-sand-200: #ede5d9;
  --color-sand-300: #e4dcc9;
  --color-sand-400: #d9cdb5;
  --color-sand-500: #cdbf9d;
  --color-sand-600: #bfa87f;
  --color-sand-700: #a8905f;
  --color-sand-800: #8a7245;
  --color-sand-900: #6b5735;

  /* Amber/Gold — Active, Attention, Interaction */
  --color-amber-50: #fffbf0;
  --color-amber-100: #fff3d6;
  --color-amber-200: #ffe8ad;
  --color-amber-300: #ffd97d;
  --color-amber-400: #ffb84d;
  --color-amber-500: #fa9f34;
  --color-amber-600: #d67c1f;
  --color-amber-700: #b55f15;
  --color-amber-800: #8d450e;
  --color-amber-900: #6b3408;

  /* Muted Teal — System State, Indicators */
  --color-teal-50: #f2f9f8;
  --color-teal-100: #d5f0ed;
  --color-teal-200: #b8e7e0;
  --color-teal-300: #8dd7ce;
  --color-teal-400: #5ec4b8;
  --color-teal-500: #3da89f;
  --color-teal-600: #2d8a82;
  --color-teal-700: #25706a;
  --color-teal-800: #1d5855;
  --color-teal-900: #154442;

  /* Warm Grays — Hierarchy, Backgrounds */
  --color-gray-50: #faf9f7;
  --color-gray-100: #f3f1ee;
  --color-gray-200: #e8e4df;
  --color-gray-300: #dcd6ce;
  --color-gray-400: #c9bfb3;
  --color-gray-500: #b3a897;
  --color-gray-600: #9b8f7f;
  --color-gray-700: #7e7268;
  --color-gray-800: #5d5350;
  --color-gray-900: #3d3632;

  /* Status Colors */
  --color-success: #4fad6f;
  --color-warning: #d4a82e;
  --color-error: #d4615b;
  --color-info: #5d8ba8;

  /* Semantic Neutrals — Text, Borders */
  --color-black: #1a1a1a;
  --color-white: #ffffff;
}
```

### 2.2 Surface & Background System

```css
:root {
  /* Primary surface — main window background */
  --surface-primary: var(--color-sand-100);

  /* Secondary surface — nested panels, cards */
  --surface-secondary: var(--color-sand-50);

  /* Tertiary surface — side panels, overlays */
  --surface-tertiary: var(--color-gray-100);

  /* Elevated surface — floating panels, popovers */
  --surface-elevated: var(--color-white);

  /* Canvas background — entire viewport */
  --canvas-bg: var(--color-sand-100);

  /* Dark mode overrides */
  @media (prefers-color-scheme: dark) {
    --surface-primary: var(--color-sand-800);
    --surface-secondary: var(--color-sand-900);
    --surface-tertiary: var(--color-gray-800);
    --surface-elevated: var(--color-gray-700);
    --canvas-bg: var(--color-sand-900);
  }
}
```

### 2.3 Border & Stroke System

```css
:root {
  /* Subtle borders — dividers, panel edges */
  --border-subtle: var(--color-gray-300);

  /* Standard borders — window frames, input focus */
  --border-standard: var(--color-gray-400);

  /* Active/Focus border — interaction highlights */
  --border-active: var(--color-amber-500);

  /* Disabled borders */
  --border-disabled: var(--color-gray-300);

  /* System indicator border */
  --border-system: var(--color-teal-400);

  @media (prefers-color-scheme: dark) {
    --border-subtle: var(--color-gray-600);
    --border-standard: var(--color-gray-500);
    --border-active: var(--color-amber-400);
    --border-system: var(--color-teal-500);
  }
}
```

### 2.4 Text & Foreground System

```css
:root {
  /* Primary text — body copy, labels */
  --text-primary: var(--color-gray-900);

  /* Secondary text — hints, descriptions */
  --text-secondary: var(--color-gray-600);

  /* Tertiary text — timestamps, metadata */
  --text-tertiary: var(--color-gray-500);

  /* Interactive text — links, buttons */
  --text-interactive: var(--color-amber-600);

  /* Inverse text — on dark backgrounds */
  --text-inverse: var(--color-sand-100);

  /* Disabled text */
  --text-disabled: var(--color-gray-400);

  /* System/status text */
  --text-system: var(--color-teal-600);

  @media (prefers-color-scheme: dark) {
    --text-primary: var(--color-sand-100);
    --text-secondary: var(--color-gray-300);
    --text-tertiary: var(--color-gray-400);
    --text-interactive: var(--color-amber-300);
    --text-inverse: var(--color-gray-900);
    --text-disabled: var(--color-gray-600);
    --text-system: var(--color-teal-300);
  }
}
```

### 2.5 Accent & State Colors

```css
:root {
  /* Primary accent — active elements, emphasis */
  --accent-primary: var(--color-amber-500);

  /* Accent hover state */
  --accent-primary-hover: var(--color-amber-600);

  /* Accent pressed state */
  --accent-primary-active: var(--color-amber-700);

  /* Accent muted/secondary use */
  --accent-primary-muted: var(--color-amber-200);

  /* Agent working indicator */
  --state-working: var(--color-teal-400);

  /* Success state */
  --state-success: var(--color-success);

  /* Error state */
  --state-error: var(--color-error);

  /* Warning state */
  --state-warning: var(--color-warning);

  /* Info/system state */
  --state-info: var(--color-info);

  @media (prefers-color-scheme: dark) {
    --accent-primary: var(--color-amber-400);
    --accent-primary-hover: var(--color-amber-300);
    --accent-primary-active: var(--color-amber-200);
    --accent-primary-muted: var(--color-amber-700);
    --state-working: var(--color-teal-300);
    --state-success: #66d98a;
    --state-error: #f07773;
    --state-warning: #ffc857;
    --state-info: #74a5d1;
  }
}
```

---

## 3. Typography System

### 3.1 Font Families

```css
:root {
  /* Primary serif for body text — readable, warm, professional */
  --font-body: "Charter", "Bitstream Charter", "Georgia", serif;

  /* System sans-serif for UI labels, tight spaces */
  --font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;

  /* Monospace for code, terminal output, data */
  --font-mono: "Cascadia Code", "Menlo", "Monaco", "Courier New", monospace;

  /* Display serif — bold headers, emphasis */
  --font-display: "Crimson Text", "Charter", "Georgia", serif;
}
```

### 3.2 Type Scale

```css
:root {
  /* Display — page titles, large headings */
  --type-display-1: {
    font-family: var(--font-display);
    font-size: 2.8rem;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  --type-display-2: {
    font-family: var(--font-display);
    font-size: 2.2rem;
    line-height: 1.3;
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  /* Heading — section titles, window titles */
  --type-heading-1: {
    font-family: var(--font-body);
    font-size: 1.8rem;
    line-height: 1.35;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  --type-heading-2: {
    font-family: var(--font-body);
    font-size: 1.4rem;
    line-height: 1.4;
    font-weight: 700;
  }

  --type-heading-3: {
    font-family: var(--font-body);
    font-size: 1.1rem;
    line-height: 1.5;
    font-weight: 700;
  }

  /* Body text — standard reading */
  --type-body-lg: {
    font-family: var(--font-body);
    font-size: 1.05rem;
    line-height: 1.6;
    font-weight: 400;
  }

  --type-body: {
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.6;
    font-weight: 400;
  }

  --type-body-sm: {
    font-family: var(--font-body);
    font-size: 0.95rem;
    line-height: 1.5;
    font-weight: 400;
  }

  /* Label — UI labels, button text */
  --type-label-lg: {
    font-family: var(--font-system);
    font-size: 0.95rem;
    line-height: 1.4;
    font-weight: 500;
    letter-spacing: 0.3px;
  }

  --type-label: {
    font-family: var(--font-system);
    font-size: 0.85rem;
    line-height: 1.4;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  --type-label-sm: {
    font-family: var(--font-system);
    font-size: 0.75rem;
    line-height: 1.3;
    font-weight: 600;
    letter-spacing: 0.8px;
  }

  /* Caption — timestamps, metadata, help text */
  --type-caption: {
    font-family: var(--font-system);
    font-size: 0.8rem;
    line-height: 1.4;
    font-weight: 400;
    color: var(--text-tertiary);
  }

  --type-caption-sm: {
    font-family: var(--font-system);
    font-size: 0.7rem;
    line-height: 1.3;
    font-weight: 400;
    color: var(--text-tertiary);
  }

  /* Code — terminal, data, snippets */
  --type-code: {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    line-height: 1.5;
    font-weight: 400;
    letter-spacing: 0.5px;
  }

  --type-code-sm: {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.4;
    font-weight: 400;
  }
}
```

### 3.3 Font Weight Scale

```css
:root {
  --weight-light: 300;
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-extrabold: 800;
}
```

---

## 4. Spacing Scale

```css
:root {
  /* Base unit = 0.25rem (4px) */
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */

  /* Semantic spacing */
  --padding-xs: var(--space-2);
  --padding-sm: var(--space-3);
  --padding-md: var(--space-4);
  --padding-lg: var(--space-6);
  --padding-xl: var(--space-8);

  --gap-xs: var(--space-2);
  --gap-sm: var(--space-3);
  --gap-md: var(--space-4);
  --gap-lg: var(--space-6);
  --gap-xl: var(--space-8);

  --margin-xs: var(--space-2);
  --margin-sm: var(--space-3);
  --margin-md: var(--space-4);
  --margin-lg: var(--space-6);
  --margin-xl: var(--space-8);
}
```

---

## 5. Border Radius Scale

```css
:root {
  /* Small radius — buttons, input fields, tight UI */
  --radius-sm: 2px;

  /* Standard radius — cards, panels, modals */
  --radius-md: 4px;

  /* Large radius — soft, welcoming containers */
  --radius-lg: 6px;

  /* Extra large radius — large panels, full-screen dialogs */
  --radius-xl: 8px;

  /* Fully rounded — pills, badges, circular elements */
  --radius-full: 9999px;

  /* Window chrome uses larger radii */
  --radius-window: 6px;

  /* Cards in magnetic layout use slight rounding */
  --radius-card: 4px;
}
```

---

## 6. Shadow System

### 6.1 Elevation Shadows

Shadows convey depth and magnetic attachment hierarchy. Warm-toned shadows maintain cohesion with sand/clay palette.

```css
:root {
  /* No shadow — inline elements, flat design */
  --shadow-none: none;

  /* Subtle shadow — slightly elevated surfaces, input fields */
  --shadow-sm: 0 1px 3px rgba(107, 87, 53, 0.12),
               0 1px 2px rgba(107, 87, 53, 0.08);

  /* Standard shadow — cards, panels at normal depth */
  --shadow-md: 0 4px 6px rgba(107, 87, 53, 0.1),
               0 2px 4px rgba(107, 87, 53, 0.06);

  /* Large shadow — floating panels, modals, prominent windows */
  --shadow-lg: 0 10px 15px rgba(107, 87, 53, 0.15),
               0 4px 6px rgba(107, 87, 53, 0.05);

  /* Extra large shadow — prominent floating UI, drag states */
  --shadow-xl: 0 20px 25px rgba(107, 87, 53, 0.2),
               0 10px 10px rgba(107, 87, 53, 0.04);

  /* Maximum shadow — full-screen overlays, deep modals */
  --shadow-2xl: 0 25px 50px rgba(107, 87, 53, 0.25);

  /* Inset shadow — depressed/pressed states */
  --shadow-inset: inset 0 2px 4px rgba(107, 87, 53, 0.06);

  /* Active/focus glow — emphasizes interaction */
  --shadow-focus: 0 0 0 3px var(--color-amber-100),
                  0 0 0 5px var(--color-amber-400);

  /* Dark mode overrides */
  @media (prefers-color-scheme: dark) {
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3),
                 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4),
                 0 2px 4px rgba(0, 0, 0, 0.15);
    --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5),
                 0 4px 6px rgba(0, 0, 0, 0.1);
    --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.6),
                 0 10px 10px rgba(0, 0, 0, 0.1);
    --shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.7);
    --shadow-focus: 0 0 0 3px var(--color-amber-900),
                    0 0 0 5px var(--color-amber-400);
  }
}
```

### 6.2 Magnetic Attachment Shadow

When windows magnetically attach, they cast a unified shadow as one group:

```css
.window-group--magnetic {
  box-shadow: var(--shadow-lg);
  /* Individual windows lose their shadows; parent gets unified shadow */
}

.window-group--magnetic .window {
  box-shadow: none;
}
```

---

## 7. Animation System

### 7.1 Timing & Easing

```css
:root {
  /* Duration scales — milliseconds */
  --duration-instant: 75ms;
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 350ms;
  --duration-slowest: 500ms;

  /* Easing curves — CSS easing functions */

  /* smooth in/out — default for most interactions */
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);

  /* quick pop — immediate, snappy feel for small elements */
  --ease-snap: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* gentle ease — subtle, calm animations */
  --ease-gentle: cubic-bezier(0.25, 0.46, 0.45, 0.94);

  /* sharp ease-in — focus entry, emphasis */
  --ease-enter: cubic-bezier(0.4, 0, 1, 1);

  /* sharp ease-out — focus exit, dismiss */
  --ease-exit: cubic-bezier(0, 0, 0.2, 1);

  /* bounce-like for playful feedback */
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

### 7.2 Animatable Properties

```css
/* What animates and when */

/* Quick snappy animations (duration-fast) */
/* - Hover state color changes */
/* - Focus ring appearance/disappearance */
/* - Button press feedback */
/* - Icon rotations (loading spinners) */

/* Standard animations (duration-base) */
/* - Window open/close */
/* - Panel slide in/out */
/* - Task graph appearance */
/* - State transitions (idle → working) */
/* - Element fade in/out */

/* Slow thoughtful animations (duration-slow) */
/* - Multi-step agent task progress */
/* - Window magnetic attachment */
/* - Large panel repositioning */
/* - Ambient background transitions */

/* Instant (no animation) */
/* - Text color changes */
/* - Border color changes (unless focus-related) */
/* - Content layout shifts without visual flow */
```

### 7.3 Common Animation Patterns

```css
/* Window opening — scale up from center with fade */
@keyframes window-open {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.window--open {
  animation: window-open var(--duration-base) var(--ease-snap) forwards;
}

/* Window closing — scale down with fade */
@keyframes window-close {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

.window--closing {
  animation: window-close var(--duration-base) var(--ease-smooth) forwards;
}

/* Panel slide in from right */
@keyframes panel-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.panel--slide-in {
  animation: panel-slide-in var(--duration-base) var(--ease-smooth) forwards;
}

/* Magnetic attachment — snap to grid position */
@keyframes magnetic-snap {
  from {
    transform: translate(var(--from-x), var(--from-y));
  }
  to {
    transform: translate(0, 0);
  }
}

.window--snapping {
  animation: magnetic-snap var(--duration-fast) var(--ease-snap) forwards;
}

/* Loading spinner — continuous rotation */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  animation: spin var(--duration-slowest) linear infinite;
}

/* Pulse — gentle opacity shift (thinking/working state) */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.state--working .indicator {
  animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
}

/* Slide in from bottom — new task/message appears */
@keyframes slide-up {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.task--new {
  animation: slide-up var(--duration-fast) var(--ease-smooth) forwards;
}
```

---

## 8. Window Chrome Design

The window frame combines warmth (rounded corners, tan borders) with clarity (subtle shadow, readable title bar).

### 8.1 Window Container Structure

```html
<div class="window" data-window-id="task-123">
  <!-- Chrome bar — draggable, contains controls -->
  <div class="window__chrome">
    <div class="window__header">
      <h3 class="window__title">Analyze Customer Feedback</h3>
      <div class="window__indicators">
        <span class="indicator indicator--status" data-status="working"></span>
      </div>
    </div>
    <div class="window__controls">
      <button class="window__control window__minimize" aria-label="Minimize">
        <svg><!-- minus icon --></svg>
      </button>
      <button class="window__control window__maximize" aria-label="Maximize">
        <svg><!-- expand icon --></svg>
      </button>
      <button class="window__control window__close" aria-label="Close">
        <svg><!-- x icon --></svg>
      </button>
    </div>
  </div>

  <!-- Content area — scrollable -->
  <div class="window__body">
    <!-- Window content goes here -->
  </div>

  <!-- Resize handles — bottom-right corner, edges -->
  <div class="window__resize-handle window__resize-handle--corner"></div>
</div>
```

### 8.2 Window Chrome Styling

```css
.window {
  /* Default size and positioning */
  width: 480px;
  min-width: 320px;
  min-height: 240px;
  position: absolute;

  /* Warm border and shadow */
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-window);
  background: var(--surface-primary);
  box-shadow: var(--shadow-md);

  /* Display flex for chrome layout */
  display: flex;
  flex-direction: column;

  /* Smooth transitions when properties change */
  transition: box-shadow var(--duration-fast) var(--ease-smooth),
              background-color var(--duration-fast) var(--ease-smooth);

  /* Focus state */
  &:focus-within {
    border-color: var(--border-active);
    box-shadow: var(--shadow-lg);
  }
}

/* Window chrome — the title bar and controls */
.window__chrome {
  /* Drag handle area */
  padding: var(--padding-md);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  cursor: grab;

  /* Slightly darker background for visual separation */
  border-radius: var(--radius-window) var(--radius-window) 0 0;

  &:active {
    cursor: grabbing;
  }
}

.window__header {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
  flex: 1;
  min-width: 0;
}

.window__title {
  /* Typography — heading level 3 */
  font: var(--type-heading-3);
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.window__indicators {
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}

/* Control buttons — minimize, maximize, close */
.window__controls {
  display: flex;
  gap: var(--gap-sm);
}

.window__control {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;

  /* Icon inside */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  /* Hover state */
  &:hover {
    background: var(--color-amber-100);
    color: var(--accent-primary);
  }

  &:active {
    background: var(--color-amber-200);
    color: var(--accent-primary-active);
  }

  /* Focus state */
  &:focus-visible {
    outline: 2px solid var(--border-active);
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    &:hover {
      background: var(--color-amber-800);
    }
    &:active {
      background: var(--color-amber-700);
    }
  }
}

/* Body — main content area */
.window__body {
  flex: 1;
  padding: var(--padding-lg);
  overflow: auto;
  background: var(--surface-primary);
}

/* Resize handles */
.window__resize-handle {
  position: absolute;
  background: transparent;

  /* Corner handle — bottom-right */
  &--corner {
    width: 16px;
    height: 16px;
    bottom: 0;
    right: 0;
    cursor: nwse-resize;
    border-radius: 0 0 var(--radius-window) 0;
  }

  /* Edge handles — less commonly used, subtle */
  &--edge {
    &-e {
      width: 4px;
      height: 100%;
      right: 0;
      top: 0;
      cursor: ew-resize;
    }
    &-s {
      width: 100%;
      height: 4px;
      bottom: 0;
      left: 0;
      cursor: ns-resize;
    }
  }
}

/* Window in focused state — when it has user attention */
.window--focused {
  border-color: var(--border-active);
  box-shadow: var(--shadow-lg);
  z-index: 10;
}

/* Window in minimized state */
.window--minimized {
  height: auto !important;

  .window__body {
    display: none;
  }
}

/* Window in maximized state */
.window--maximized {
  width: 100% !important;
  height: 100% !important;
  top: 0 !important;
  left: 0 !important;
  border-radius: 0;
}
```

---

## 9. Magnetic Attachment & Card System

Windows "snap" together like cards in solitaire, implying grouping and hierarchy without rigid tiling.

### 9.1 Magnetic Attachment Behavior

```css
/* Window group — multiple windows magnetized together */
.window-group {
  position: relative;
  /* Group acts as a single draggable unit */
}

.window-group--magnetic {
  /* All children cast unified shadow */
  box-shadow: var(--shadow-lg);

  /* Windows inside lose individual shadows */
  .window {
    box-shadow: none;
    border: 1px solid var(--border-subtle);
  }

  /* Shared border on outer edge only */
  .window {
    border-radius: 0;

    /* First window gets left/top radius */
    &:first-child {
      border-radius: var(--radius-window) var(--radius-window) 0 0;
    }

    /* Last window gets bottom radius */
    &:last-child {
      border-radius: 0 0 var(--radius-window) var(--radius-window);
    }

    /* If only one window, full radius */
    &:only-child {
      border-radius: var(--radius-window);
    }
  }
}

/* Magnetic snap animation — when windows dock */
.window--snapping-to-group {
  animation: magnetic-snap var(--duration-fast) var(--ease-snap) forwards;
}

/* Visual indication that window is hovering near group (ready to snap) */
.window-group--magnetic-target {
  .window-group {
    border: 2px dashed var(--border-active);
    transition: border-color var(--duration-fast) var(--ease-smooth);
  }
}
```

### 9.2 Card Styling

Cards can be used within windows, in panels, or standalone for custom LLM-generated UIs.

```css
/* Card — basic container for content grouping */
.card {
  padding: var(--padding-lg);
  background: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sm);

  transition: box-shadow var(--duration-fast) var(--ease-smooth),
              border-color var(--duration-fast) var(--ease-smooth);

  /* Hover state — slight elevation */
  &:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-standard);
  }

  /* Active/selected card */
  &.card--active {
    border-color: var(--border-active);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-focus);
  }

  /* Disabled card */
  &.card--disabled {
    opacity: 0.6;
    cursor: not-allowed;

    &:hover {
      box-shadow: var(--shadow-sm);
      border-color: var(--border-disabled);
    }
  }
}

/* Card variants */

/* Elevated card — floats above surface */
.card--elevated {
  background: var(--surface-elevated);
  box-shadow: var(--shadow-md);
}

/* Outlined card — border-focused, minimal shadow */
.card--outlined {
  background: transparent;
  border: 2px solid var(--border-standard);
  box-shadow: none;

  &:hover {
    border-color: var(--border-active);
    box-shadow: var(--shadow-sm);
  }
}

/* Flat card — no shadow, subtle border only */
.card--flat {
  box-shadow: none;
  border: 1px solid var(--border-subtle);
}

/* Success/Error/Info cards for feedback */
.card--success {
  border-color: var(--state-success);
  background: rgba(79, 173, 111, 0.05);

  @media (prefers-color-scheme: dark) {
    background: rgba(102, 217, 138, 0.08);
  }
}

.card--error {
  border-color: var(--state-error);
  background: rgba(212, 97, 91, 0.05);

  @media (prefers-color-scheme: dark) {
    background: rgba(240, 119, 115, 0.08);
  }
}

.card--warning {
  border-color: var(--state-warning);
  background: rgba(212, 168, 46, 0.05);

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 200, 87, 0.08);
  }
}

.card--info {
  border-color: var(--state-info);
  background: rgba(93, 139, 168, 0.05);

  @media (prefers-color-scheme: dark) {
    background: rgba(116, 165, 209, 0.08);
  }
}
```

---

## 10. Task Graph Panel Design

The right-side pull-out bar shows all tasks as a live visual DAG (directed acyclic graph), revealing dependencies, blocking relationships, agent assignments, and progress.

### 10.1 Task Graph Panel Layout

```html
<aside class="task-graph-panel">
  <!-- Header with controls -->
  <div class="task-graph__header">
    <h2 class="task-graph__title">Active Tasks</h2>
    <button class="task-graph__close" aria-label="Close panel">×</button>
  </div>

  <!-- Filter/search bar -->
  <div class="task-graph__controls">
    <input type="search" class="task-graph__search" placeholder="Filter tasks...">
    <div class="task-graph__filters">
      <!-- Filter buttons: Working, Blocked, Complete, etc. -->
    </div>
  </div>

  <!-- SVG canvas for DAG visualization -->
  <svg class="task-graph__canvas" role="img" aria-label="Task dependency graph">
    <!-- Edges (dependencies, blocking relationships) -->
    <g class="task-graph__edges">
      <line class="task-graph__edge task-graph__edge--blocks" />
      <line class="task-graph__edge task-graph__edge--depends" />
    </g>

    <!-- Nodes (tasks) -->
    <g class="task-graph__nodes">
      <circle class="task-graph__node task-graph__node--working" />
      <circle class="task-graph__node task-graph__node--blocked" />
      <circle class="task-graph__node task-graph__node--complete" />
    </g>
  </svg>

  <!-- List view (optional toggle) -->
  <div class="task-graph__list">
    <!-- Task list items with metadata -->
  </div>
</aside>
```

### 10.2 Task Graph Styling

```css
/* Task graph panel — right-side pull-out */
.task-graph-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 380px;
  height: 100vh;
  background: var(--surface-tertiary);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  z-index: 100;

  /* Slide in animation */
  animation: panel-slide-in var(--duration-base) var(--ease-smooth) forwards;

  /* Closed state slides out */
  &.task-graph-panel--closed {
    animation: panel-slide-out var(--duration-base) var(--ease-smooth) forwards;
  }
}

.task-graph__header {
  padding: var(--padding-lg);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-graph__title {
  font: var(--type-heading-2);
  color: var(--text-primary);
  margin: 0;
}

.task-graph__close {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  font: 1.5rem / 1 var(--font-system);
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    background: var(--color-amber-100);
    border-radius: var(--radius-sm);
  }

  @media (prefers-color-scheme: dark) {
    &:hover {
      background: var(--color-amber-800);
    }
  }
}

.task-graph__controls {
  padding: var(--padding-md);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.task-graph__search {
  padding: var(--padding-sm);
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font: var(--type-body-sm);
  color: var(--text-primary);

  &:focus {
    outline: none;
    border-color: var(--border-active);
    box-shadow: var(--shadow-focus);
  }

  &::placeholder {
    color: var(--text-tertiary);
  }
}

.task-graph__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
}

/* Task graph canvas — SVG visualization */
.task-graph__canvas {
  flex: 1;
  background: var(--surface-primary);
  overflow: auto;

  /* Light grid background (optional) */
  background-image:
    linear-gradient(var(--color-gray-300) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-gray-300) 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: 0 0, 0 0;

  @media (prefers-color-scheme: dark) {
    background-image:
      linear-gradient(var(--color-gray-600) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-gray-600) 1px, transparent 1px);
  }
}

/* Task graph edges — dependencies and blocking relationships */
.task-graph__edge {
  stroke: var(--border-subtle);
  stroke-width: 2px;
  fill: none;
  marker-end: url(#arrowhead);

  /* Depends-on relationship — solid line */
  &--depends {
    stroke: var(--border-standard);
  }

  /* Blocking relationship — dashed line, thicker */
  &--blocks {
    stroke: var(--state-warning);
    stroke-dasharray: 6, 4;
    stroke-width: 2.5px;
  }

  /* Optional relationships */
  &--optional {
    stroke: var(--border-subtle);
    stroke-dasharray: 4, 4;
    opacity: 0.6;
  }
}

/* Task graph nodes — individual tasks */
.task-graph__node {
  r: 12px;
  fill: var(--surface-elevated);
  stroke: var(--border-standard);
  stroke-width: 2px;
  cursor: pointer;

  transition: r var(--duration-fast) var(--ease-smooth),
              fill var(--duration-fast) var(--ease-smooth),
              stroke var(--duration-fast) var(--ease-smooth),
              filter var(--duration-fast) var(--ease-smooth);

  /* Hover state — enlarge, brighten */
  &:hover {
    r: 16px;
    filter: drop-shadow(0 0 8px rgba(107, 87, 53, 0.3));
  }

  /* Working state — teal, pulsing */
  &--working {
    fill: var(--state-working);
    stroke: var(--color-teal-600);
    animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
  }

  /* Blocked state — warning color, dashed stroke */
  &--blocked {
    fill: var(--state-warning);
    stroke: var(--state-warning);
    opacity: 0.8;

    &:hover {
      opacity: 1;
    }
  }

  /* Complete state — success green */
  &--complete {
    fill: var(--state-success);
    stroke: var(--state-success);
    opacity: 0.8;
  }

  /* Error state — red */
  &--error {
    fill: var(--state-error);
    stroke: var(--state-error);
  }

  /* Selected node — accent border */
  &.task-graph__node--selected {
    stroke: var(--border-active);
    stroke-width: 3px;
    filter: drop-shadow(0 0 12px rgba(250, 159, 52, 0.5));
  }
}

/* Task node labels (text in SVG) */
.task-graph__node-label {
  font: var(--type-caption-sm);
  text-anchor: middle;
  dominant-baseline: middle;
  fill: var(--text-primary);
  pointer-events: none;
}

/* Task list view (alternative/supplementary to graph) */
.task-graph__list {
  border-top: 1px solid var(--border-subtle);
  flex: 0 0 auto;
  max-height: 40%;
  overflow-y: auto;
  padding: var(--padding-md);
}

.task-graph__list-item {
  padding: var(--padding-sm);
  margin-bottom: var(--margin-sm);
  background: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;

  transition: background-color var(--duration-fast) var(--ease-smooth),
              border-color var(--duration-fast) var(--ease-smooth);

  &:hover {
    background: var(--surface-primary);
    border-color: var(--border-active);
  }

  &.task-graph__list-item--selected {
    background: var(--color-amber-100);
    border-color: var(--border-active);

    @media (prefers-color-scheme: dark) {
      background: var(--color-amber-800);
    }
  }
}

.task-graph__list-item-title {
  font: var(--type-label-sm);
  color: var(--text-primary);
  margin: 0 0 var(--margin-xs) 0;
}

.task-graph__list-item-status {
  font: var(--type-caption-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}

.task-graph__list-item-status-badge {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);

  /* Color based on state */
  &--working { background: var(--state-working); }
  &--blocked { background: var(--state-warning); }
  &--complete { background: var(--state-success); }
  &--error { background: var(--state-error); }
}
```

---

## 11. Input Bar Design

Simple text input bar at the bottom with multimodal support, context awareness, and voice input via swipe.

### 11.1 Input Bar Structure

```html
<div class="input-bar">
  <!-- Context indicator — shows current scope -->
  <div class="input-bar__context">
    <span class="input-bar__context-label">Global</span>
    <span class="input-bar__context-icon" title="This command affects the entire system">🌐</span>
  </div>

  <!-- Drag-drop zone for files/images/screenshots -->
  <div class="input-bar__dropzone">
    <!-- Main input field -->
    <input
      type="text"
      class="input-bar__input"
      placeholder="Describe what you need..."
      aria-label="Command input"
    >

    <!-- Attachment indicator (when files are pending) -->
    <div class="input-bar__attachments" hidden>
      <!-- File pills will appear here -->
    </div>
  </div>

  <!-- Voice toggle — swipe right to activate -->
  <button class="input-bar__voice-toggle" aria-label="Enable voice input">
    <svg class="input-bar__voice-icon"><!-- microphone icon --></svg>
  </button>

  <!-- Send button -->
  <button class="input-bar__submit" aria-label="Send command">
    <svg class="input-bar__submit-icon"><!-- send arrow icon --></svg>
  </button>
</div>

<!-- Voice recorder panel (appears when voice is active) -->
<div class="voice-recorder" hidden>
  <!-- Waveform visualization, recording controls -->
</div>
```

### 11.2 Input Bar Styling

```css
/* Input bar container — fixed at bottom */
.input-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--padding-lg);
  background: var(--surface-primary);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: flex-end;
  gap: var(--gap-md);
  z-index: 50;

  /* Slide up animation when appearing */
  animation: slide-up var(--duration-base) var(--ease-smooth) forwards;
}

.input-bar__context {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--padding-sm);
  background: var(--surface-secondary);
  border-radius: var(--radius-sm);
}

.input-bar__context-label {
  font: var(--type-label-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
}

.input-bar__context-icon {
  font-size: 0.9rem;
  opacity: 0.7;

  /* Change icon based on context */
  &[data-context="global"] {
    content: "🌐";
  }
  &[data-context="focused"] {
    content: "📍";
  }
  &[data-context="agent"] {
    content: "🤖";
  }
}

/* Dropzone — main input area */
.input-bar__dropzone {
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: var(--gap-md);
  padding: var(--padding-sm) var(--padding-md);
  background: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);

  /* Hover/focus states */
  transition: border-color var(--duration-fast) var(--ease-smooth),
              box-shadow var(--duration-fast) var(--ease-smooth),
              background-color var(--duration-fast) var(--ease-smooth);

  &:hover {
    border-color: var(--border-standard);
  }

  &:focus-within {
    border-color: var(--border-active);
    box-shadow: var(--shadow-focus);
  }

  /* Drag-over state — highlight for file drop */
  &.input-bar__dropzone--drag-over {
    border-color: var(--border-active);
    background: var(--color-amber-50);
    box-shadow: var(--shadow-md);

    @media (prefers-color-scheme: dark) {
      background: var(--color-amber-900);
    }
  }
}

/* Main input field */
.input-bar__input {
  flex: 1;
  background: transparent;
  border: none;
  font: var(--type-body);
  color: var(--text-primary);
  padding: var(--padding-sm) 0;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* Attachment pills — pending files/images */
.input-bar__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
  padding: var(--padding-sm) 0;
}

.input-bar__attachment {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--padding-xs) var(--padding-sm);
  background: var(--color-amber-100);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-full);
  font: var(--type-label-sm);
  color: var(--accent-primary);

  @media (prefers-color-scheme: dark) {
    background: var(--color-amber-800);
    color: var(--color-amber-200);
  }

  .input-bar__attachment-remove {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;

    &:hover {
      opacity: 0.7;
    }
  }
}

/* Voice toggle button */
.input-bar__voice-toggle {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  background: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  transition: background-color var(--duration-fast) var(--ease-smooth),
              border-color var(--duration-fast) var(--ease-smooth),
              color var(--duration-fast) var(--ease-smooth);

  &:hover {
    background: var(--color-amber-100);
    border-color: var(--border-active);
    color: var(--accent-primary);

    @media (prefers-color-scheme: dark) {
      background: var(--color-amber-800);
    }
  }

  /* Active state — recording */
  &.input-bar__voice-toggle--active {
    background: var(--state-working);
    border-color: var(--state-working);
    color: var(--color-white);
    animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
  }
}

.input-bar__voice-icon {
  width: 20px;
  height: 20px;
}

/* Submit button */
.input-bar__submit {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-white);

  transition: background-color var(--duration-fast) var(--ease-smooth),
              transform var(--duration-fast) var(--ease-smooth),
              box-shadow var(--duration-fast) var(--ease-smooth);

  &:hover {
    background: var(--accent-primary-hover);
    box-shadow: var(--shadow-md);
  }

  &:active {
    background: var(--accent-primary-active);
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid var(--border-active);
    outline-offset: 2px;
  }

  &:disabled {
    background: var(--color-gray-400);
    cursor: not-allowed;
    opacity: 0.6;

    &:hover {
      box-shadow: var(--shadow-sm);
    }
  }
}

.input-bar__submit-icon {
  width: 20px;
  height: 20px;
}

/* Voice recorder panel — appears when voice mode active */
.voice-recorder {
  position: fixed;
  bottom: calc(100% + var(--padding-lg));
  left: var(--padding-lg);
  right: var(--padding-lg);
  padding: var(--padding-lg);
  background: var(--surface-elevated);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 51;

  animation: slide-up var(--duration-base) var(--ease-smooth) forwards;
}

.voice-recorder__waveform {
  width: 100%;
  height: 60px;
  margin-bottom: var(--margin-lg);
  background: var(--surface-secondary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
}

.voice-recorder__wave-bar {
  width: 3px;
  background: var(--accent-primary);
  border-radius: var(--radius-full);
  animation: voice-wave var(--duration-base) var(--ease-smooth) infinite;

  @for $i from 1 to 20 {
    &:nth-child(#{$i}) {
      animation-delay: calc(var(--duration-base) * #{$i} / 20);
    }
  }
}

@keyframes voice-wave {
  0%, 100% {
    height: 4px;
  }
  50% {
    height: 24px;
  }
}

.voice-recorder__time {
  font: var(--type-label-sm);
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: var(--margin-md);
}

.voice-recorder__controls {
  display: flex;
  gap: var(--gap-md);
  justify-content: center;
}

.voice-recorder__btn {
  padding: var(--padding-md) var(--padding-lg);
  border: none;
  border-radius: var(--radius-md);
  font: var(--type-label);
  cursor: pointer;

  transition: background-color var(--duration-fast) var(--ease-smooth);

  &--cancel {
    background: var(--surface-secondary);
    color: var(--text-primary);

    &:hover {
      background: var(--color-gray-300);
    }
  }

  &--submit {
    background: var(--accent-primary);
    color: var(--color-white);

    &:hover {
      background: var(--accent-primary-hover);
    }
  }
}
```

---

## 12. Icon System

Icons maintain consistent visual weight and style. Preference for line-based icons (2px stroke) over filled icons for UI cleanliness.

### 12.1 Icon Grid & Sizing

```css
:root {
  /* Icon sizes — all multiples of 4px */
  --icon-xs: 16px;    /* smallest, tight spaces */
  --icon-sm: 20px;    /* standard UI icons */
  --icon-md: 24px;    /* prominent icons */
  --icon-lg: 32px;    /* large decorative/informational */
  --icon-xl: 48px;    /* hero icons */

  /* Icon stroke weight */
  --icon-stroke: 2px;
  --icon-stroke-sm: 1.5px;

  /* Icon fill — match text color */
  --icon-fill: currentColor;
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;

  /* Default size */
  width: var(--icon-md);
  height: var(--icon-md);

  /* Size variants */
  &--xs { width: var(--icon-xs); height: var(--icon-xs); }
  &--sm { width: var(--icon-sm); height: var(--icon-sm); }
  &--md { width: var(--icon-md); height: var(--icon-md); }
  &--lg { width: var(--icon-lg); height: var(--icon-lg); }
  &--xl { width: var(--icon-xl); height: var(--icon-xl); }

  /* Animated rotation (for spinners) */
  &--spinning {
    animation: spin var(--duration-slowest) linear infinite;
  }

  /* Pulsing animation (for alerts) */
  &--pulsing {
    animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
  }
}
```

### 12.2 Common Icon Set

Recommended icons (implementable as SVG, font icons, or component library):

- **Navigation:** chevron-left, chevron-right, chevron-down, chevron-up, close/x, menu/hamburger, arrow-left, arrow-right
- **Window Control:** minimize, maximize, restore, close
- **Actions:** plus/add, trash/delete, edit/pencil, check/checkmark, send/arrow, settings/gear, more/dots
- **Status:** alert/warning triangle, error/x-circle, check-circle, info/circle, clock/time, hourglass/loading
- **Agents:** robot/bot, user/person, users/people, network/connect
- **Views:** window/grid, list, graph/nodes, eye/view, hide/eye-off
- **Input:** file/document, image/picture, video, microphone, voice/sound, attachment/paperclip

---

## 13. State Indicators

Visual feedback for agent activity, task status, and system states.

### 13.1 State Indicator Components

```html
<!-- Loading/Working indicator -->
<span class="indicator indicator--working" aria-label="Agent working"></span>

<!-- Success indicator -->
<span class="indicator indicator--success" aria-label="Task complete"></span>

<!-- Error indicator -->
<span class="indicator indicator--error" aria-label="Task failed"></span>

<!-- Blocked indicator -->
<span class="indicator indicator--blocked" aria-label="Task blocked"></span>

<!-- Idle/standby indicator -->
<span class="indicator indicator--idle" aria-label="Ready"></span>
```

### 13.2 State Indicator Styling

```css
.indicator {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  flex-shrink: 0;

  /* Transition between states */
  transition: background-color var(--duration-fast) var(--ease-smooth),
              box-shadow var(--duration-fast) var(--ease-smooth);

  /* Working state — teal, pulsing */
  &--working {
    background: var(--state-working);
    box-shadow: 0 0 8px var(--state-working);
    animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
  }

  /* Success state — green, solid */
  &--success {
    background: var(--state-success);
    animation: none;
  }

  /* Error state — red, solid */
  &--error {
    background: var(--state-error);
    animation: none;
  }

  /* Warning/Blocked state — amber, with dashes */
  &--blocked {
    background: transparent;
    border: 2px solid var(--state-warning);
    animation: pulse var(--duration-slowest) var(--ease-smooth) infinite;
  }

  /* Idle/ready state — gray, subtle */
  &--idle {
    background: var(--color-gray-400);
    opacity: 0.6;
  }

  /* Large indicator variant (for emphasis) */
  &--lg {
    width: 16px;
    height: 16px;
  }

  /* Minimal indicator (for compact spaces) */
  &--sm {
    width: 8px;
    height: 8px;
  }
}

/* Status badge — combines icon + text */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--padding-xs) var(--padding-sm);
  background: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font: var(--type-label-sm);
  color: var(--text-secondary);

  /* Variant for each state */
  &--working {
    background: rgba(61, 168, 159, 0.1);
    border-color: var(--state-working);
    color: var(--state-working);

    .indicator {
      background: var(--state-working);
    }
  }

  &--success {
    background: rgba(79, 173, 111, 0.1);
    border-color: var(--state-success);
    color: var(--state-success);

    .indicator {
      background: var(--state-success);
    }
  }

  &--error {
    background: rgba(212, 97, 91, 0.1);
    border-color: var(--state-error);
    color: var(--state-error);

    .indicator {
      background: var(--state-error);
    }
  }

  &--blocked {
    background: rgba(212, 168, 46, 0.1);
    border-color: var(--state-warning);
    color: var(--state-warning);

    .indicator {
      border-color: var(--state-warning);
    }
  }

  @media (prefers-color-scheme: dark) {
    &--working {
      background: rgba(61, 168, 159, 0.15);
    }
    &--success {
      background: rgba(102, 217, 138, 0.15);
    }
    &--error {
      background: rgba(240, 119, 115, 0.15);
    }
    &--blocked {
      background: rgba(255, 200, 87, 0.15);
    }
  }
}
```

---

## 14. Dark Mode Specifications

The system supports dark mode via `prefers-color-scheme: dark` media query. Warm palette maintains coherence in both modes.

### 14.1 Dark Mode Color Adjustments

Dark mode uses warmer grays and inverted text colors, maintaining the same warm aesthetic. All CSS custom properties already include dark mode overrides throughout this document.

### 14.2 Dark Mode Best Practices

- **Contrast:** Ensure text contrast remains ≥ 4.5:1 for body text, ≥ 3:1 for UI elements
- **Avoid pure black/white:** Use warm grays (sand-800 for backgrounds, sand-100 for text)
- **Reduce brightness:** Lower shadow opacity in dark mode; avoid glowing effects that strain eyes
- **Maintain hierarchy:** Same typography and spacing scales; only color values change
- **Respect preference:** Never force dark mode; follow OS/browser preference

```css
/* Example dark mode adjustments already in system */
@media (prefers-color-scheme: dark) {
  :root {
    --surface-primary: var(--color-sand-800);
    --text-primary: var(--color-sand-100);
    --border-active: var(--color-amber-400);
    /* ... all other properties ... */
  }
}
```

---

## 15. Responsive Design Principles

The interface scales from compact (laptop) to expansive (ultra-wide monitors). Windows remain draggable and resizable on all screen sizes.

```css
/* Small screens — iPad, small laptop */
@media (max-width: 768px) {
  .task-graph-panel {
    width: 100%;
    max-height: 50vh;
    position: fixed;
    bottom: 0;
    right: auto;
  }

  .input-bar {
    flex-direction: column;
    padding: var(--padding-md);
  }

  .window {
    min-width: 280px;
    width: calc(100% - var(--padding-md) * 2);
  }

  /* Hide some non-essential UI */
  .window__maximize {
    display: none;
  }
}

/* Medium screens — standard laptop */
@media (min-width: 769px) and (max-width: 1200px) {
  /* Proportional window sizing */
  .window {
    max-width: 60vw;
  }

  .task-graph-panel {
    width: 340px;
  }
}

/* Large screens — desktop, ultra-wide */
@media (min-width: 1201px) {
  /* Full use of space */
  .window {
    max-width: 50vw;
  }

  .task-graph-panel {
    width: 380px;
  }
}
```

---

## 16. Accessibility Specifications

All components meet WCAG 2.1 AA standards minimum.

```css
/* Focus indicators — keyboard navigation */
:focus-visible {
  outline: 2px solid var(--border-active);
  outline-offset: 2px;
}

/* Reduced motion — respect user preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* High contrast mode — boost colors */
@media (prefers-contrast: more) {
  :root {
    /* Increase color saturation */
    --color-amber-500: #ff9500;
    --color-teal-500: #2fa89f;
    --text-primary: var(--color-gray-900);
  }
}

/* High contrast mode — darker */
@media (forced-colors: active) {
  :root {
    /* Use system colors for maximum contrast */
    --surface-primary: Canvas;
    --text-primary: CanvasText;
    --border-active: ButtonBorder;
  }
}
```

---

## 17. Implementation Checklist

- [ ] Define all CSS custom properties in `:root`
- [ ] Implement color system across all surfaces (backgrounds, borders, text, accents)
- [ ] Set up typography with proper font families, sizes, weights, and line-heights
- [ ] Create spacing scale and apply consistently
- [ ] Design window chrome with title bar, controls, resize handles
- [ ] Implement magnetic attachment behavior and card styling
- [ ] Build task graph panel with SVG DAG visualization
- [ ] Create input bar with multimodal support
- [ ] Define icon system and sizes
- [ ] Implement state indicators (working, success, error, blocked)
- [ ] Add dark mode support with proper overrides
- [ ] Test responsive design across breakpoints
- [ ] Validate WCAG AA accessibility compliance
- [ ] Create animation library (opening, closing, snapping, pulsing)
- [ ] Document all color, typography, and spacing choices for consistency

---

## 18. Design Tokens Export (CSS Variables Summary)

```css
:root {
  /* Colors */
  --color-sand-50: #faf7f2;
  --color-sand-100: #f5f0e8;
  --color-sand-500: #cdbf9d;
  --color-sand-800: #8a7245;
  --color-sand-900: #6b5735;

  --color-amber-100: #fff3d6;
  --color-amber-400: #ffb84d;
  --color-amber-500: #fa9f34;
  --color-amber-600: #d67c1f;

  --color-teal-400: #5ec4b8;
  --color-teal-500: #3da89f;
  --color-teal-600: #2d8a82;

  --color-gray-100: #f3f1ee;
  --color-gray-300: #dcd6ce;
  --color-gray-600: #9b8f7f;
  --color-gray-900: #3d3632;

  /* Semantic surfaces */
  --surface-primary: var(--color-sand-100);
  --surface-secondary: var(--color-sand-50);
  --surface-tertiary: var(--color-gray-100);
  --surface-elevated: var(--color-white);

  /* Text colors */
  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --text-tertiary: var(--color-gray-500);

  /* Borders */
  --border-subtle: var(--color-gray-300);
  --border-active: var(--color-amber-500);

  /* Accents and states */
  --accent-primary: var(--color-amber-500);
  --state-working: var(--color-teal-400);
  --state-success: #4fad6f;
  --state-error: #d4615b;
  --state-warning: #d4a82e;

  /* Typography */
  --font-body: "Charter", "Bitstream Charter", "Georgia", serif;
  --font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Cascadia Code", "Menlo", "Monaco", monospace;

  /* Spacing */
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --padding-md: var(--space-4);
  --padding-lg: var(--space-6);
  --gap-md: var(--space-4);

  /* Radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-window: 6px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(107, 87, 53, 0.12), 0 1px 2px rgba(107, 87, 53, 0.08);
  --shadow-md: 0 4px 6px rgba(107, 87, 53, 0.1), 0 2px 4px rgba(107, 87, 53, 0.06);
  --shadow-lg: 0 10px 15px rgba(107, 87, 53, 0.15), 0 4px 6px rgba(107, 87, 53, 0.05);

  /* Timing */
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 350ms;
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-snap: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Document Metadata

- **Type:** Interface Design Language (System & Style Guide)
- **Version:** 1.0
- **Scope:** Complete visual specification for LLM-native OS implementation
- **Audience:** Claude Code, frontend developers, design systems engineers
- **Status:** Self-contained, production-ready specification

All values, specifications, and design decisions above are normative and ready for immediate implementation.

