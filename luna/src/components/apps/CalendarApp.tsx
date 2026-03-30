import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GLASS } from './glassStyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO datetime
  end: string;   // ISO datetime
  color?: string;
  description?: string;
  allDay?: boolean;
}

export interface CalendarAppProps {
  events?: CalendarEvent[];
  view?: 'month' | 'week' | 'day';
  selectedDate?: string; // ISO date
  onChange?: (events: CalendarEvent[]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_COLORS = [
  '#d4a574', // amber
  '#e07a5f', // coral
  '#5faa9e', // teal
  '#9b7ec8', // purple
  '#c77dba', // pink
  '#7ea8c8', // blue
  '#c8b87e', // gold
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Date helpers (no external deps)
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function toISODateTime(d: Date): string {
  return d.toISOString();
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return m === 0 ? `${hh} ${ampm}` : `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const start = addDays(first, -startDay);
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    // Stop if the next week is entirely in the next month
    if (cursor.getMonth() !== month && w >= 4) break;
  }
  return weeks;
}

function getWeekStart(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function getWeekDays(d: Date): Date[] {
  const start = getWeekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 86400000;
  return events.filter((e) => {
    const eStart = new Date(e.start).getTime();
    const eEnd = new Date(e.end).getTime();
    return eStart < dayEnd && eEnd > dayStart;
  });
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Inline styles (CSS-in-JS, dark theme)
// ---------------------------------------------------------------------------

const css = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    overflow: 'hidden',
    userSelect: 'none' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    ...GLASS.elevated,
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 600,
    minWidth: 200,
  },
  navBtn: {
    ...GLASS.ghostBtn,
    padding: '4px 10px',
    fontSize: 13,
    lineHeight: '20px',
  },
  todayBtn: {
    ...GLASS.ghostBtn,
    padding: '4px 12px',
    fontSize: 13,
    fontWeight: 500,
  },
  viewSwitcher: {
    display: 'flex',
    marginLeft: 'auto',
    border: `1px solid ${GLASS.dividerColor}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  viewBtn: (active: boolean) => ({
    background: active ? 'var(--accent-primary)' : 'transparent',
    color: active ? '#000' : 'var(--text-primary)',
    border: 'none',
    padding: '4px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderRight: `1px solid ${GLASS.dividerColor}`,
  }),
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: `1px solid ${GLASS.dividerColor}`,
    padding: 12,
    overflowY: 'auto' as const,
    ...GLASS.elevated,
  },
  main: {
    flex: 1,
    overflow: 'auto',
    position: 'relative' as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Mini calendar for sidebar */
function MiniCalendar({
  currentDate,
  selectedDate,
  onSelect,
}: {
  currentDate: Date;
  selectedDate: Date;
  onSelect: (d: Date) => void;
}) {
  const [viewDate, setViewDate] = useState(new Date(currentDate));
  const today = useMemo(() => startOfDay(new Date()), []);
  const weeks = useMemo(
    () => getMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button
          style={{ ...css.navBtn, padding: '2px 6px', fontSize: 11 }}
          onClick={() => setViewDate(addMonths(viewDate, -1))}
          aria-label="Previous month"
        >
          &#8249;
        </button>
        <span style={{ fontWeight: 600 }}>
          {MONTHS[viewDate.getMonth()].slice(0, 3)} {viewDate.getFullYear()}
        </span>
        <button
          style={{ ...css.navBtn, padding: '2px 6px', fontSize: 11 }}
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          aria-label="Next month"
        >
          &#8250;
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {DAYS_MIN.map((d, i) => (
              <th
                key={i}
                style={{
                  padding: 2,
                  fontWeight: 400,
                  color: i === 0 || i === 6 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textAlign: 'center',
                }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDate);
                const inMonth = isSameMonth(day, viewDate);
                return (
                  <td
                    key={di}
                    onClick={() => onSelect(day)}
                    style={{
                      textAlign: 'center',
                      padding: 2,
                      cursor: 'pointer',
                      borderRadius: '50%',
                      color: !inMonth
                        ? 'var(--text-tertiary)'
                        : isSelected
                        ? '#1a1614'
                        : 'var(--text-primary)',
                      background: isSelected
                        ? 'var(--accent-primary)'
                        : isToday
                        ? 'rgba(126,184,255,0.15)'
                        : 'transparent',
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {day.getDate()}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline event creation / editing form */
function EventForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Partial<CalendarEvent> & { start: string; end: string };
  onSave: (e: CalendarEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [start, setStart] = useState(initial.start.slice(0, 16)); // datetime-local format
  const [end, setEnd] = useState(initial.end.slice(0, 16));
  const [color, setColor] = useState(initial.color || EVENT_COLORS[0]);
  const [allDay, setAllDay] = useState(initial.allDay || false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: initial.id || generateId(),
      title: title.trim(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      color,
      description,
      allDay,
    });
  };

  const fieldStyle: React.CSSProperties = {
    ...GLASS.inset,
    width: '100%',
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const formBtnStyle: React.CSSProperties = {
    padding: '5px 14px',
    borderRadius: 5,
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        zIndex: 100,
        ...GLASS.elevated,
        backdropFilter: 'blur(40px) saturate(var(--glass-saturation))',
        WebkitBackdropFilter: 'blur(40px) saturate(var(--glass-saturation))',
        borderRadius: 8,
        padding: 14,
        width: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        style={{ ...fieldStyle, fontSize: 14, fontWeight: 600, marginBottom: 10 }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          style={{ accentColor: 'var(--accent-primary)' }}
        />
        All day
      </label>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Start</div>
          <input
            type={allDay ? 'date' : 'datetime-local'}
            value={allDay ? start.slice(0, 10) : start}
            onChange={(e) => setStart(e.target.value)}
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>End</div>
          <input
            type={allDay ? 'date' : 'datetime-local'}
            value={allDay ? end.slice(0, 10) : end}
            onChange={(e) => setEnd(e.target.value)}
            style={fieldStyle}
          />
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...fieldStyle, marginBottom: 10, resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {EVENT_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              border: c === color ? '2px solid var(--text-primary)' : '2px solid transparent',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{ ...formBtnStyle, background: '#6b3030', color: '#e8e0d8', marginRight: 'auto' }}
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{ ...formBtnStyle, ...GLASS.ghostBtn }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{ ...formBtnStyle, ...GLASS.accentBtn }}
        >
          Save
        </button>
      </div>
    </form>
  );
}

/** Current time red indicator line */
function NowIndicator({ hourHeight }: { hourHeight: number }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const top = (now.getHours() + now.getMinutes() / 60) * hourHeight;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e05555', flexShrink: 0, marginLeft: -4 }} />
      <div style={{ flex: 1, height: 2, background: '#e05555' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

function MonthView({
  currentDate,
  events,
  onClickDay,
  onClickEvent,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onClickDay: (d: Date) => void;
  onClickEvent: (e: CalendarEvent, rect: DOMRect) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const weeks = useMemo(
    () => getMonthGrid(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {DAYS_SHORT.map((d, i) => (
          <div
            key={d}
            style={{
              padding: '6px 8px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: i === 0 || i === 6 ? 'var(--text-tertiary)' : 'var(--text-primary)',
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              minHeight: 0,
            }}
          >
            {week.map((day, di) => {
              const inMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, today);
              const dayEvents = eventsForDay(events, day);
              const isWeekend = di === 0 || di === 6;

              return (
                <div
                  key={di}
                  onClick={() => onClickDay(day)}
                  style={{
                    borderRight: di < 6 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    padding: 4,
                    cursor: 'pointer',
                    background: isToday ? 'rgba(126,184,255,0.08)' : 'transparent',
                    overflow: 'hidden',
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      lineHeight: '24px',
                      textAlign: 'center',
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 400,
                      color: !inMonth
                        ? 'var(--text-tertiary)'
                        : isToday
                        ? '#1a1614'
                        : isWeekend
                        ? 'var(--text-tertiary)'
                        : 'var(--text-primary)',
                      background: isToday ? 'var(--accent-primary)' : 'transparent',
                      marginBottom: 2,
                    }}
                  >
                    {day.getDate()}
                  </div>
                  {dayEvents.slice(0, 3).map((evt) => (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        onClickEvent(evt, rect);
                      }}
                      style={{
                        fontSize: 11,
                        lineHeight: '16px',
                        padding: '1px 4px',
                        marginBottom: 1,
                        borderRadius: 3,
                        background: evt.color || EVENT_COLORS[0],
                        color: '#000',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                      title={evt.title}
                    >
                      {evt.allDay ? '' : formatTime(new Date(evt.start)) + ' '}{evt.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 4 }}>
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time Grid (shared by Week & Day views)
// ---------------------------------------------------------------------------

const HOUR_HEIGHT = 56;

function TimeGrid({
  days,
  events,
  onClickSlot,
  onClickEvent,
}: {
  days: Date[];
  events: CalendarEvent[];
  onClickSlot: (date: Date, hour: number, rect: DOMRect) => void;
  onClickEvent: (e: CalendarEvent, rect: DOMRect) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  // Scroll to ~8 AM on mount
  useEffect(() => {
    if (scrollRef.current && !hasScrolled.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT - 20;
      hasScrolled.current = true;
    }
  }, []);

  // Compute positioned events per column
  const dayEventPositions = useMemo(() => {
    return days.map((day) => {
      const dayEvts = eventsForDay(events, day).filter((e) => !e.allDay);
      // Simple overlap resolution: sort by start, assign columns
      const sorted = [...dayEvts].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
      const columns: CalendarEvent[][] = [];
      const eventCols = new Map<string, number>();
      for (const evt of sorted) {
        const evtStart = new Date(evt.start).getTime();
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          const last = columns[c][columns[c].length - 1];
          if (new Date(last.end).getTime() <= evtStart) {
            columns[c].push(evt);
            eventCols.set(evt.id, c);
            placed = true;
            break;
          }
        }
        if (!placed) {
          eventCols.set(evt.id, columns.length);
          columns.push([evt]);
        }
      }
      const totalCols = Math.max(columns.length, 1);
      return { events: sorted, eventCols, totalCols };
    });
  }, [days, events]);

  // All-day events
  const allDayEvents = useMemo(
    () =>
      days.map((day) =>
        eventsForDay(events, day).filter((e) => e.allDay),
      ),
    [days, events],
  );
  const hasAllDay = allDayEvents.some((a) => a.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header row with day names */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `56px repeat(${days.length}, 1fr)`,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }} />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div
              key={i}
              style={{
                textAlign: 'center',
                padding: '8px 0 4px',
                borderRight: i < days.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  color: isWeekend ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {DAYS_SHORT[day.getDay()]}
              </div>
              <div
                style={{
                  width: 28,
                  height: 28,
                  lineHeight: '28px',
                  margin: '2px auto 0',
                  borderRadius: '50%',
                  fontSize: 16,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#1a1614' : 'var(--text-primary)',
                  background: isToday ? 'var(--accent-primary)' : 'transparent',
                }}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day section */}
      {hasAllDay && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `56px repeat(${days.length}, 1fr)`,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              padding: '4px 4px',
              textAlign: 'right',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            all-day
          </div>
          {allDayEvents.map((dayEvts, i) => (
            <div
              key={i}
              style={{
                padding: 2,
                borderRight: i < days.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                minHeight: 24,
              }}
            >
              {dayEvts.map((evt) => (
                <div
                  key={evt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickEvent(evt, (e.target as HTMLElement).getBoundingClientRect());
                  }}
                  style={{
                    fontSize: 11,
                    padding: '1px 4px',
                    borderRadius: 3,
                    background: evt.color || EVENT_COLORS[0],
                    color: '#000',
                    fontWeight: 500,
                    marginBottom: 1,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {evt.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `56px repeat(${days.length}, 1fr)`,
            position: 'relative',
            minHeight: 24 * HOUR_HEIGHT,
          }}
        >
          {/* Hour labels */}
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{
                  height: HOUR_HEIGHT,
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  textAlign: 'right',
                  paddingRight: 8,
                  paddingTop: 0,
                  position: 'relative',
                  top: -6,
                }}
              >
                {h === 0 ? '' : formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const isToday = isSameDay(day, today);
            const { events: colEvts, eventCols, totalCols } = dayEventPositions[colIdx];

            return (
              <div
                key={colIdx}
                style={{
                  position: 'relative',
                  borderRight: colIdx < days.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  background: isToday ? 'rgba(126,184,255,0.04)' : 'transparent',
                }}
              >
                {/* Hour lines and click targets */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      onClickSlot(day, h, rect);
                    }}
                    style={{
                      height: HOUR_HEIGHT,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                    }}
                  />
                ))}

                {/* Event blocks */}
                {colEvts.map((evt) => {
                  const evtStart = new Date(evt.start);
                  const evtEnd = new Date(evt.end);
                  const dayStart = startOfDay(day);
                  // Clamp to day boundaries
                  const renderStart = Math.max(evtStart.getTime(), dayStart.getTime());
                  const renderEnd = Math.min(evtEnd.getTime(), dayStart.getTime() + 86400000);
                  const topMinutes = (renderStart - dayStart.getTime()) / 60000;
                  const durationMinutes = (renderEnd - renderStart) / 60000;
                  const top = (topMinutes / 60) * HOUR_HEIGHT;
                  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 18);
                  const col = eventCols.get(evt.id) || 0;
                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;

                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickEvent(evt, (e.target as HTMLElement).getBoundingClientRect());
                      }}
                      style={{
                        position: 'absolute',
                        top,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        height,
                        background: evt.color || EVENT_COLORS[0],
                        color: '#000',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 11,
                        fontWeight: 500,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        lineHeight: '14px',
                        zIndex: 10,
                        borderLeft: `3px solid color-mix(in srgb, ${evt.color || EVENT_COLORS[0]} 60%, #000)`,
                      }}
                      title={`${evt.title}\n${formatTime(evtStart)} - ${formatTime(evtEnd)}`}
                    >
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {evt.title}
                      </div>
                      {height > 30 && (
                        <div style={{ fontSize: 10, opacity: 0.8 }}>
                          {formatTime(evtStart)} - {formatTime(evtEnd)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Now indicator */}
                {isToday && <NowIndicator hourHeight={HOUR_HEIGHT} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CalendarApp({
  events: externalEvents,
  view: initialView = 'month',
  selectedDate: initialDate,
  onChange,
}: CalendarAppProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalEvents = useRef<string>(JSON.stringify(externalEvents));

  const [view, setView] = useState<'month' | 'week' | 'day'>(initialView);
  const [currentDate, setCurrentDate] = useState(() =>
    initialDate ? new Date(initialDate) : new Date(),
  );
  const [events, setEvents] = useState<CalendarEvent[]>(externalEvents || []);
  const [formState, setFormState] = useState<{
    mode: 'create' | 'edit';
    event: Partial<CalendarEvent> & { start: string; end: string };
    position: { top: number; left: number };
  } | null>(null);

  // Sync external events
  useEffect(() => {
    const serialized = JSON.stringify(externalEvents);
    if (serialized === lastExternalEvents.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalEvents.current = serialized;
    if (externalEvents) setEvents(externalEvents);
  }, [externalEvents]);

  // Sync external view prop
  useEffect(() => {
    if (initialView !== undefined) {
      setView(initialView);
    }
  }, [initialView]);

  // Sync external selectedDate prop
  useEffect(() => {
    if (initialDate !== undefined) {
      setCurrentDate(new Date(initialDate));
    }
  }, [initialDate]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Propagate changes
  const updateEvents = useCallback(
    (next: CalendarEvent[]) => {
      isInternalEdit.current = true;
      setEvents(next);
      onChange?.(next);
    },
    [onChange],
  );

  // Navigation
  const goToday = useCallback(() => setCurrentDate(new Date()), []);
  const goPrev = useCallback(() => {
    setCurrentDate((d) => {
      if (view === 'month') return addMonths(d, -1);
      if (view === 'week') return addDays(d, -7);
      return addDays(d, -1);
    });
  }, [view]);
  const goNext = useCallback(() => {
    setCurrentDate((d) => {
      if (view === 'month') return addMonths(d, 1);
      if (view === 'week') return addDays(d, 7);
      return addDays(d, 1);
    });
  }, [view]);

  // Header title
  const headerTitle = useMemo(() => {
    if (view === 'month') {
      return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      const first = weekDays[0];
      const last = weekDays[6];
      if (first.getMonth() === last.getMonth()) {
        return `${MONTHS[first.getMonth()]} ${first.getDate()} - ${last.getDate()}, ${first.getFullYear()}`;
      }
      return `${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()} - ${MONTHS[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }, [view, currentDate]);

  // Compute form position relative to container
  const formPosition = useCallback(
    (rect: DOMRect): { top: number; left: number } => {
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) return { top: rect.top, left: rect.left };
      let top = rect.top - container.top;
      let left = rect.left - container.left + rect.width + 4;
      // Keep form within bounds
      if (left + 290 > container.width) left = rect.left - container.left - 290;
      if (left < 0) left = 10;
      if (top + 340 > container.height) top = container.height - 350;
      if (top < 0) top = 10;
      return { top, left };
    },
    [],
  );

  // Click handlers
  const handleClickSlot = useCallback(
    (day: Date, hour: number, rect: DOMRect) => {
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(hour + 1);
      setFormState({
        mode: 'create',
        event: {
          start: toISODateTime(start),
          end: toISODateTime(end),
          color: EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)],
        },
        position: formPosition(rect),
      });
    },
    [formPosition],
  );

  const handleClickDay = useCallback(
    (day: Date) => {
      // In month view, clicking a day creates an all-day event or switches to day view with double click
      const start = startOfDay(day);
      const end = addDays(start, 1);
      setFormState({
        mode: 'create',
        event: {
          start: toISODateTime(start),
          end: toISODateTime(end),
          allDay: true,
          color: EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)],
        },
        position: { top: 100, left: 100 },
      });
    },
    [],
  );

  const handleClickEvent = useCallback(
    (evt: CalendarEvent, rect: DOMRect) => {
      setFormState({
        mode: 'edit',
        event: evt,
        position: formPosition(rect),
      });
    },
    [formPosition],
  );

  const handleSaveEvent = useCallback(
    (evt: CalendarEvent) => {
      setFormState(null);
      const idx = events.findIndex((e) => e.id === evt.id);
      if (idx >= 0) {
        const next = [...events];
        next[idx] = evt;
        updateEvents(next);
      } else {
        updateEvents([...events, evt]);
      }
    },
    [events, updateEvents],
  );

  const handleDeleteEvent = useCallback(() => {
    if (!formState) return;
    const id = formState.event.id;
    setFormState(null);
    if (id) {
      updateEvents(events.filter((e) => e.id !== id));
    }
  }, [formState, events, updateEvents]);

  const handleMiniSelect = useCallback((d: Date) => {
    setCurrentDate(d);
  }, []);

  // Close form on outside click
  useEffect(() => {
    if (!formState) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFormState(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [formState]);

  // View-specific content
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  return (
    <div ref={containerRef} style={css.root}>
      {/* Header */}
      <div style={css.header}>
        <button style={css.todayBtn} onClick={goToday}>
          Today
        </button>
        <button style={css.navBtn} onClick={goPrev} aria-label="Previous">
          &#8249;
        </button>
        <button style={css.navBtn} onClick={goNext} aria-label="Next">
          &#8250;
        </button>
        <span style={css.headerTitle}>{headerTitle}</span>

        <div style={css.viewSwitcher}>
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              style={css.viewBtn(view === v)}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={css.body}>
        {/* Sidebar with mini calendar */}
        <div style={css.sidebar}>
          <MiniCalendar
            currentDate={currentDate}
            selectedDate={currentDate}
            onSelect={handleMiniSelect}
          />
          {/* Upcoming events list */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Upcoming
            </div>
            {events
              .filter((e) => new Date(e.start).getTime() >= Date.now())
              .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
              .slice(0, 5)
              .map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    handleClickEvent(evt, rect);
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: evt.color || EVENT_COLORS[0],
                      marginTop: 3,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px' }}>{evt.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {new Date(evt.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {!evt.allDay && ` ${formatTime(new Date(evt.start))}`}
                    </div>
                  </div>
                </div>
              ))}
            {events.filter((e) => new Date(e.start).getTime() >= Date.now()).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No upcoming events</div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div style={css.main}>
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onClickDay={handleClickDay}
              onClickEvent={handleClickEvent}
            />
          )}
          {view === 'week' && (
            <TimeGrid
              days={weekDays}
              events={events}
              onClickSlot={handleClickSlot}
              onClickEvent={handleClickEvent}
            />
          )}
          {view === 'day' && (
            <TimeGrid
              days={[startOfDay(currentDate)]}
              events={events}
              onClickSlot={handleClickSlot}
              onClickEvent={handleClickEvent}
            />
          )}

          {/* Event form overlay */}
          {formState && (
            <div style={{ position: 'absolute', top: formState.position.top, left: formState.position.left, zIndex: 100 }}>
              <EventForm
                initial={formState.event as Partial<CalendarEvent> & { start: string; end: string }}
                onSave={handleSaveEvent}
                onCancel={() => setFormState(null)}
                onDelete={formState.mode === 'edit' ? handleDeleteEvent : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CalendarApp;
