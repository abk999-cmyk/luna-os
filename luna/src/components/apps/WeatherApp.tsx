import React, { useState, useMemo } from 'react';
import { GLASS } from './glassStyles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CityWeather {
  name: string;
  baseTempC: number;   // avg temp for the city
  amplitude: number;   // daily swing
  humidity: number;
  windKph: number;
  uvIndex: number;
  condition: string;
  icon: string;
}

interface HourForecast {
  hour: number;
  tempC: number;
  icon: string;
  condition: string;
}

interface DayForecast {
  day: string;
  highC: number;
  lowC: number;
  icon: string;
  condition: string;
}

/* ------------------------------------------------------------------ */
/*  Mock data helpers                                                  */
/* ------------------------------------------------------------------ */

const CITIES: CityWeather[] = [
  { name: 'New York',      baseTempC: 14, amplitude: 8,  humidity: 62, windKph: 18, uvIndex: 5, condition: 'Partly Cloudy', icon: '🌤' },
  { name: 'London',        baseTempC: 11, amplitude: 5,  humidity: 78, windKph: 22, uvIndex: 3, condition: 'Overcast',      icon: '⛅' },
  { name: 'Tokyo',         baseTempC: 18, amplitude: 7,  humidity: 58, windKph: 12, uvIndex: 6, condition: 'Clear',         icon: '☀️' },
  { name: 'Sydney',        baseTempC: 22, amplitude: 6,  humidity: 55, windKph: 15, uvIndex: 8, condition: 'Sunny',         icon: '☀️' },
  { name: 'San Francisco', baseTempC: 15, amplitude: 4,  humidity: 72, windKph: 20, uvIndex: 4, condition: 'Fog',           icon: '🌫️' },
];

const CONDITIONS: { range: [number, number]; condition: string; icon: string }[] = [
  { range: [-20, 0],  condition: 'Snow',          icon: '🌨' },
  { range: [0, 8],    condition: 'Cold & Cloudy',  icon: '⛅' },
  { range: [8, 15],   condition: 'Partly Cloudy',  icon: '🌤' },
  { range: [15, 24],  condition: 'Clear',          icon: '☀️' },
  { range: [24, 30],  condition: 'Warm & Sunny',   icon: '☀️' },
  { range: [30, 50],  condition: 'Hot',            icon: '🔥' },
];

function getCondition(tempC: number): { condition: string; icon: string } {
  for (const c of CONDITIONS) {
    if (tempC >= c.range[0] && tempC < c.range[1]) return c;
  }
  return CONDITIONS[CONDITIONS.length - 1];
}

function seededTemp(city: CityWeather, hour: number, dayOffset: number): number {
  const dailyPhase = Math.sin(((hour - 6) / 24) * Math.PI * 2) * city.amplitude;
  const dayVar = Math.sin(dayOffset * 1.3 + city.baseTempC * 0.1) * 3;
  return Math.round((city.baseTempC + dailyPhase + dayVar) * 10) / 10;
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S: Record<string, React.CSSProperties> = {
  root: {
    ...GLASS.appRoot,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    flexShrink: 0,
  },
  citySelect: {
    ...GLASS.inset,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'var(--font-ui)',
    minWidth: 160,
  },
  unitBtn: {
    ...GLASS.ghostBtn,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 16px 16px',
  },
  currentBlock: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 20,
    padding: '20px 0 16px',
  },
  tempLarge: {
    fontSize: 56,
    fontWeight: 200,
    lineHeight: 1,
    letterSpacing: '-2px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
  },
  conditionText: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginTop: 6,
  },
  iconLarge: {
    fontSize: 48,
    lineHeight: 1,
    marginTop: 4,
  },
  statsRow: {
    display: 'flex',
    gap: 24,
    padding: '12px 0',
    borderTop: `1px solid ${GLASS.dividerColor}`,
    borderBottom: `1px solid ${GLASS.dividerColor}`,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontWeight: 500,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
    margin: '16px 0 8px',
  },
  hourlyStrip: {
    display: 'flex',
    gap: 2,
    overflowX: 'auto' as const,
    paddingBottom: 8,
  },
  hourCard: {
    ...GLASS.elevated,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    padding: '8px 10px',
    borderRadius: 10,
    minWidth: 56,
    flexShrink: 0,
  },
  hourTime: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontWeight: 500,
  },
  hourIcon: {
    fontSize: 18,
  },
  hourTemp: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  dayRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${GLASS.dividerColor}`,
    gap: 12,
  },
  dayName: {
    width: 40,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  dayIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center' as const,
  },
  dayCondition: {
    flex: 1,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  dayTemps: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
  },
  dayTempLow: {
    color: 'var(--text-tertiary)',
    fontWeight: 400,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WeatherApp({ initialCity }: { initialCity?: string }) {
  const [cityIdx, setCityIdx] = useState(() => {
    const idx = CITIES.findIndex(c => c.name === initialCity);
    return idx >= 0 ? idx : 0;
  });
  const [useFahrenheit, setUseFahrenheit] = useState(false);

  const city = CITIES[cityIdx];
  const now = new Date();
  const currentHour = now.getHours();

  const fmt = (c: number) => {
    const v = useFahrenheit ? cToF(c) : Math.round(c);
    return `${v}°`;
  };

  const fmtUnit = (c: number) => {
    const v = useFahrenheit ? cToF(c) : Math.round(c);
    return `${v}°${useFahrenheit ? 'F' : 'C'}`;
  };

  const currentTemp = useMemo(() => seededTemp(city, currentHour, 0), [city, currentHour]);
  const currentCond = useMemo(() => getCondition(currentTemp), [currentTemp]);

  const hourly: HourForecast[] = useMemo(() => {
    const arr: HourForecast[] = [];
    for (let i = 0; i < 24; i++) {
      const h = (currentHour + i) % 24;
      const dayOff = (currentHour + i) >= 24 ? 1 : 0;
      const t = seededTemp(city, h, dayOff);
      const cond = getCondition(t);
      arr.push({ hour: h, tempC: t, icon: cond.icon, condition: cond.condition });
    }
    return arr;
  }, [city, currentHour]);

  const daily: DayForecast[] = useMemo(() => {
    const arr: DayForecast[] = [];
    for (let d = 0; d < 5; d++) {
      let high = -999, low = 999;
      for (let h = 0; h < 24; h++) {
        const t = seededTemp(city, h, d);
        if (t > high) high = t;
        if (t < low) low = t;
      }
      const midTemp = (high + low) / 2;
      const cond = getCondition(midTemp);
      const date = new Date();
      date.setDate(date.getDate() + d);
      arr.push({
        day: d === 0 ? 'Today' : DAY_NAMES[date.getDay()],
        highC: Math.round(high),
        lowC: Math.round(low),
        icon: cond.icon,
        condition: cond.condition,
      });
    }
    return arr;
  }, [city]);

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <select
          style={S.citySelect}
          value={cityIdx}
          onChange={(e) => setCityIdx(Number(e.target.value))}
        >
          {CITIES.map((c, i) => (
            <option key={c.name} value={i}>{c.name}</option>
          ))}
        </select>
        <button
          style={{
            ...S.unitBtn,
            ...(useFahrenheit ? {} : { background: GLASS.selectedBg, color: 'var(--accent-primary)' }),
          }}
          onClick={() => setUseFahrenheit(f => !f)}
        >
          {useFahrenheit ? '°F' : '°C'}
        </button>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Current conditions */}
        <div style={S.currentBlock}>
          <div>
            <div style={S.tempLarge}>{fmtUnit(currentTemp)}</div>
            <div style={S.conditionText}>{currentCond.condition}</div>
          </div>
          <div style={S.iconLarge}>{currentCond.icon}</div>
        </div>

        {/* Stats */}
        <div style={S.statsRow}>
          <div style={S.statItem}>
            <span style={S.statLabel}>Humidity</span>
            <span style={S.statValue}>{city.humidity}%</span>
          </div>
          <div style={S.statItem}>
            <span style={S.statLabel}>Wind</span>
            <span style={S.statValue}>{city.windKph} km/h</span>
          </div>
          <div style={S.statItem}>
            <span style={S.statLabel}>UV Index</span>
            <span style={S.statValue}>{city.uvIndex}</span>
          </div>
          <div style={S.statItem}>
            <span style={S.statLabel}>Feels like</span>
            <span style={S.statValue}>{fmtUnit(currentTemp - 2)}</span>
          </div>
        </div>

        {/* Hourly */}
        <div style={S.sectionTitle}>Hourly Forecast</div>
        <div style={S.hourlyStrip}>
          {hourly.map((h, i) => (
            <div key={i} style={S.hourCard}>
              <span style={S.hourTime}>
                {i === 0 ? 'Now' : `${h.hour.toString().padStart(2, '0')}:00`}
              </span>
              <span style={S.hourIcon}>{h.icon}</span>
              <span style={S.hourTemp}>{fmt(h.tempC)}</span>
            </div>
          ))}
        </div>

        {/* 5-day */}
        <div style={S.sectionTitle}>5-Day Forecast</div>
        <div>
          {daily.map((d, i) => (
            <div key={i} style={S.dayRow}>
              <span style={S.dayName}>{d.day}</span>
              <span style={S.dayIcon}>{d.icon}</span>
              <span style={S.dayCondition}>{d.condition}</span>
              <span style={S.dayTemps}>
                {fmt(d.highC)}{' '}
                <span style={S.dayTempLow}>{fmt(d.lowC)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WeatherApp;
