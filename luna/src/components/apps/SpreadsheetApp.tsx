import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CellData {
  value: string;
  formula?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  bgColor?: string;
  textColor?: string;
}

export interface SpreadsheetAppProps {
  initialData?: Record<string, Record<string, CellData>>;
  sheets?: string[];
  onChange?: (sheetName: string, cellRef: string, value: string) => void;
}

interface CellCoord {
  row: number; // 0-based
  col: number; // 0-based
}

interface Selection {
  start: CellCoord;
  end: CellCoord;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COL_WIDTH = 100;
const MIN_COL_WIDTH = 36;
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 28;
const ROW_HEADER_WIDTH = 48;
const INITIAL_ROWS = 100;
const INITIAL_COLS = 26;
const VISIBLE_BUFFER = 4; // extra rows/cols to render outside viewport

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colIndexToLetter(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function letterToColIndex(s: string): number {
  let idx = 0;
  for (let i = 0; i < s.length; i++) {
    idx = idx * 26 + (s.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function cellRef(row: number, col: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

function parseRef(ref: string): CellCoord | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: letterToColIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

function normalizeSelection(sel: Selection): Selection {
  return {
    start: {
      row: Math.min(sel.start.row, sel.end.row),
      col: Math.min(sel.start.col, sel.end.col),
    },
    end: {
      row: Math.max(sel.start.row, sel.end.row),
      col: Math.max(sel.start.col, sel.end.col),
    },
  };
}

function isInSelection(row: number, col: number, sel: Selection | null): boolean {
  if (!sel) return false;
  const n = normalizeSelection(sel);
  return row >= n.start.row && row <= n.end.row && col >= n.start.col && col <= n.end.col;
}

// ---------------------------------------------------------------------------
// Formula Engine
// ---------------------------------------------------------------------------

type SheetDataMap = Record<string, CellData>;

function resolveValue(
  ref: string,
  data: SheetDataMap,
  visited: Set<string>,
): number {
  if (visited.has(ref)) return NaN; // circular
  visited.add(ref);
  const cell = data[ref];
  if (!cell) return 0;
  if (cell.formula) {
    return evaluateFormula(cell.formula, data, visited);
  }
  const n = parseFloat(cell.value);
  return isNaN(n) ? 0 : n;
}

function expandRange(range: string): string[] {
  const parts = range.split(':');
  if (parts.length !== 2) return [range];
  const s = parseRef(parts[0].trim());
  const e = parseRef(parts[1].trim());
  if (!s || !e) return [range];
  const refs: string[] = [];
  const minRow = Math.min(s.row, e.row);
  const maxRow = Math.max(s.row, e.row);
  const minCol = Math.min(s.col, e.col);
  const maxCol = Math.max(s.col, e.col);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      refs.push(cellRef(r, c));
    }
  }
  return refs;
}

function evaluateFormula(
  formula: string,
  data: SheetDataMap,
  visited: Set<string>,
): number {
  const f = formula.trim();

  // =SUM(range)
  const sumMatch = f.match(/^SUM\((.+)\)$/i);
  if (sumMatch) {
    const refs = expandRange(sumMatch[1]);
    return refs.reduce((acc, r) => acc + resolveValue(r, data, new Set(visited)), 0);
  }

  // =AVERAGE(range)
  const avgMatch = f.match(/^AVERAGE\((.+)\)$/i);
  if (avgMatch) {
    const refs = expandRange(avgMatch[1]);
    if (refs.length === 0) return 0;
    const sum = refs.reduce((acc, r) => acc + resolveValue(r, data, new Set(visited)), 0);
    return sum / refs.length;
  }

  // =COUNT(range)
  const cntMatch = f.match(/^COUNT\((.+)\)$/i);
  if (cntMatch) {
    const refs = expandRange(cntMatch[1]);
    return refs.reduce((acc, r) => {
      const cell = data[r];
      if (cell && cell.value !== '' && !isNaN(parseFloat(cell.value))) return acc + 1;
      return acc;
    }, 0);
  }

  // =MIN(range)
  const minMatch = f.match(/^MIN\((.+)\)$/i);
  if (minMatch) {
    const refs = expandRange(minMatch[1]);
    const vals = refs.map((r) => resolveValue(r, data, new Set(visited)));
    return vals.length ? Math.min(...vals) : 0;
  }

  // =MAX(range)
  const maxMatch = f.match(/^MAX\((.+)\)$/i);
  if (maxMatch) {
    const refs = expandRange(maxMatch[1]);
    const vals = refs.map((r) => resolveValue(r, data, new Set(visited)));
    return vals.length ? Math.max(...vals) : 0;
  }

  // Arithmetic expression – replace cell refs with values then eval safely
  try {
    const expr = f.replace(/[A-Z]+\d+/g, (match) => {
      return String(resolveValue(match, data, new Set(visited)));
    });
    // Only allow numbers, operators, parens, dots, spaces
    if (/^[\d+\-*/().eE\s]+$/.test(expr)) {
      return Function(`"use strict"; return (${expr})`)() as number;
    }
  } catch {
    // fall through
  }
  return NaN;
}

function computeDisplay(cell: CellData | undefined, data: SheetDataMap): string {
  if (!cell) return '';
  if (cell.formula) {
    const v = evaluateFormula(cell.formula, data, new Set());
    return isNaN(v) ? '#ERR' : String(v);
  }
  return cell.value;
}

// ---------------------------------------------------------------------------
// CSS-in-JS style helpers (dark theme tokens)
// ---------------------------------------------------------------------------

const T = {
  surfaceBase: 'var(--surface-base, #1a1614)',
  surfaceElevated: 'var(--surface-elevated, #2a2420)',
  borderSubtle: 'var(--border-subtle, #3a332e)',
  accent: 'var(--color-accent, #d4a574)',
  textPrimary: 'var(--text-primary, #e8e0d8)',
  textSecondary: 'var(--text-secondary, #a89888)',
  font: 'var(--font-system, system-ui)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SpreadsheetApp: React.FC<SpreadsheetAppProps> = ({
  initialData,
  sheets: sheetsProp,
  onChange,
}) => {
  // ---- External prop sync refs ----
  const isInternalEdit = useRef(false);
  const lastExternalData = useRef<string>(JSON.stringify({ initialData, sheetsProp }));

  // ---- Sheet management ----
  const [sheetNames, setSheetNames] = useState<string[]>(
    () => sheetsProp ?? (Object.keys(initialData ?? {}).length > 0 ? Object.keys(initialData!) : ['Sheet1']),
  );
  const [activeSheet, setActiveSheet] = useState<string>(sheetNames[0]);

  // ---- Data store: sheetName -> { cellRef -> CellData } ----
  const [allData, setAllData] = useState<Record<string, SheetDataMap>>(() => {
    const d: Record<string, SheetDataMap> = {};
    for (const name of sheetNames) {
      d[name] = initialData?.[name] ? { ...initialData[name] } : {};
    }
    return d;
  });

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify({ initialData, sheetsProp });
    if (serialized === lastExternalData.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalData.current = serialized;
    const names = sheetsProp ?? (Object.keys(initialData ?? {}).length > 0 ? Object.keys(initialData!) : ['Sheet1']);
    setSheetNames(names);
    const d: Record<string, SheetDataMap> = {};
    for (const name of names) {
      d[name] = initialData?.[name] ? { ...initialData[name] } : {};
    }
    setAllData(d);
  }, [initialData, sheetsProp]);

  const data = allData[activeSheet] ?? {};

  const setData = useCallback(
    (updater: (prev: SheetDataMap) => SheetDataMap) => {
      isInternalEdit.current = true;
      setAllData((prev) => ({
        ...prev,
        [activeSheet]: updater(prev[activeSheet] ?? {}),
      }));
    },
    [activeSheet],
  );

  // ---- Grid dimensions ----
  const [numRows] = useState(INITIAL_ROWS);
  const [numCols] = useState(INITIAL_COLS);

  // ---- Column widths ----
  const [colWidths, setColWidths] = useState<number[]>(
    () => Array(INITIAL_COLS).fill(DEFAULT_COL_WIDTH),
  );

  // ---- Selection ----
  const [cursor, setCursor] = useState<CellCoord>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // ---- Editing ----
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);

  // ---- Column resize ----
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  // ---- Toolbar state ----
  const [toolBold, setToolBold] = useState(false);
  const [toolItalic, setToolItalic] = useState(false);
  const [toolAlign, setToolAlign] = useState<'left' | 'center' | 'right'>('left');
  const [toolFontSize, setToolFontSize] = useState(13);
  const [toolTextColor, setToolTextColor] = useState('');
  const [toolBgColor, setToolBgColor] = useState('');

  // ---- Scrolling / virtualisation ----
  const gridRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportW, setViewportW] = useState(800);
  const [viewportH, setViewportH] = useState(600);

  // Observe viewport size
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setViewportW(e.contentRect.width);
        setViewportH(e.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Column cumulative offsets
  const colOffsets = useMemo(() => {
    const o: number[] = [0];
    for (let i = 0; i < colWidths.length; i++) {
      o.push(o[i] + colWidths[i]);
    }
    return o;
  }, [colWidths]);

  const totalWidth = colOffsets[colOffsets.length - 1];
  const totalHeight = numRows * ROW_HEIGHT;

  // Visible range
  const visibleRows = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
    const last = Math.min(numRows - 1, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + VISIBLE_BUFFER);
    return { first, last };
  }, [scrollTop, viewportH, numRows]);

  const visibleCols = useMemo(() => {
    let first = 0;
    for (let i = 0; i < colOffsets.length - 1; i++) {
      if (colOffsets[i + 1] > scrollLeft - 200) { first = i; break; }
    }
    first = Math.max(0, first - VISIBLE_BUFFER);
    let last = numCols - 1;
    for (let i = first; i < colOffsets.length - 1; i++) {
      if (colOffsets[i] > scrollLeft + viewportW + 200) { last = i; break; }
    }
    last = Math.min(numCols - 1, last + VISIBLE_BUFFER);
    return { first, last };
  }, [scrollLeft, viewportW, colOffsets, numCols]);

  // Sync toolbar state with cursor
  useEffect(() => {
    const ref = cellRef(cursor.row, cursor.col);
    const cell = data[ref];
    setToolBold(cell?.bold ?? false);
    setToolItalic(cell?.italic ?? false);
    setToolAlign(cell?.align ?? 'left');
    setToolTextColor(cell?.textColor ?? '');
    setToolBgColor(cell?.bgColor ?? '');
  }, [cursor, data]);

  // ---- Commit edit ----
  const commitEdit = useCallback(
    (value?: string) => {
      const v = value ?? editValue;
      const ref = cellRef(cursor.row, cursor.col);
      setData((prev) => {
        const existing = prev[ref] ?? { value: '' };
        const isFormula = v.startsWith('=');
        const next: CellData = {
          ...existing,
          value: isFormula ? '' : v,
          formula: isFormula ? v.slice(1) : undefined,
        };
        if (!next.value && !next.formula && !next.bold && !next.italic && !next.bgColor && !next.textColor) {
          const copy = { ...prev };
          delete copy[ref];
          return copy;
        }
        return { ...prev, [ref]: next };
      });
      onChange?.(activeSheet, ref, v);
      setEditing(false);
    },
    [editValue, cursor, setData, onChange, activeSheet],
  );

  // ---- Start editing ----
  const startEditing = useCallback(
    (prefill?: string) => {
      const ref = cellRef(cursor.row, cursor.col);
      const cell = data[ref];
      const initial = prefill ?? (cell?.formula ? `=${cell.formula}` : cell?.value ?? '');
      setEditValue(initial);
      setEditing(true);
      // Focus will happen via useEffect
    },
    [cursor, data],
  );

  // Focus edit input when editing starts
  useEffect(() => {
    if (editing) {
      editInputRef.current?.focus();
    }
  }, [editing]);

  // ---- Cell click ----
  const handleCellMouseDown = useCallback(
    (row: number, col: number, e: MouseEvent) => {
      e.preventDefault();
      if (editing) commitEdit();

      if (e.shiftKey) {
        setSelection({ start: cursor, end: { row, col } });
      } else {
        setCursor({ row, col });
        setSelection(null);
        setIsSelecting(true);
      }
    },
    [editing, commitEdit, cursor],
  );

  const handleCellMouseEnter = useCallback(
    (row: number, col: number) => {
      if (isSelecting) {
        setSelection({ start: cursor, end: { row, col } });
      }
    },
    [isSelecting, cursor],
  );

  useEffect(() => {
    const up = () => setIsSelecting(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      setCursor({ row, col });
      startEditing();
    },
    [startEditing],
  );

  // ---- Keyboard ----
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
          setCursor((c) => ({ ...c, row: Math.min(c.row + 1, numRows - 1) }));
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitEdit();
          setCursor((c) => ({
            ...c,
            col: e.shiftKey ? Math.max(c.col - 1, 0) : Math.min(c.col + 1, numCols - 1),
          }));
        } else if (e.key === 'Escape') {
          setEditing(false);
        }
        return;
      }

      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setCursor((c) => ({
          row: Math.max(0, Math.min(c.row + dr, numRows - 1)),
          col: Math.max(0, Math.min(c.col + dc, numCols - 1)),
        }));
        setSelection(null);
      };

      if (e.key === 'ArrowUp') move(-1, 0);
      else if (e.key === 'ArrowDown') move(1, 0);
      else if (e.key === 'ArrowLeft') move(0, -1);
      else if (e.key === 'ArrowRight') move(0, 1);
      else if (e.key === 'Tab') {
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startEditing();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selection) {
          const n = normalizeSelection(selection);
          setData((prev) => {
            const copy = { ...prev };
            for (let r = n.start.row; r <= n.end.row; r++) {
              for (let c = n.start.col; c <= n.end.col; c++) {
                delete copy[cellRef(r, c)];
              }
            }
            return copy;
          });
        } else {
          const ref = cellRef(cursor.row, cursor.col);
          setData((prev) => {
            const copy = { ...prev };
            delete copy[ref];
            return copy;
          });
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        startEditing();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Start typing directly into cell
        startEditing(e.key);
      }
    },
    [editing, commitEdit, startEditing, numRows, numCols, cursor, selection, setData],
  );

  // ---- Column resize handlers ----
  const startColResize = useCallback(
    (colIdx: number, e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingCol(colIdx);
      resizeStartX.current = e.clientX;
      resizeStartW.current = colWidths[colIdx];
    },
    [colWidths],
  );

  useEffect(() => {
    if (resizingCol === null) return;
    const onMove = (e: globalThis.MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newW = Math.max(MIN_COL_WIDTH, resizeStartW.current + delta);
      setColWidths((prev) => {
        const copy = [...prev];
        copy[resizingCol] = newW;
        return copy;
      });
    };
    const onUp = () => setResizingCol(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingCol]);

  // ---- Auto-fit column on double-click resize handle ----
  const autoFitCol = useCallback(
    (colIdx: number) => {
      let maxW = 40;
      for (let r = 0; r < numRows; r++) {
        const ref = cellRef(r, colIdx);
        const cell = data[ref];
        if (cell) {
          const display = computeDisplay(cell, data);
          // rough estimate: 8px per char
          maxW = Math.max(maxW, display.length * 8 + 16);
        }
      }
      setColWidths((prev) => {
        const copy = [...prev];
        copy[colIdx] = Math.max(MIN_COL_WIDTH, Math.min(maxW, 400));
        return copy;
      });
    },
    [data, numRows],
  );

  // ---- Toolbar actions ----
  const applyFormat = useCallback(
    (updater: (cell: CellData) => CellData) => {
      const refs: string[] = [];
      if (selection) {
        const n = normalizeSelection(selection);
        for (let r = n.start.row; r <= n.end.row; r++) {
          for (let c = n.start.col; c <= n.end.col; c++) {
            refs.push(cellRef(r, c));
          }
        }
      } else {
        refs.push(cellRef(cursor.row, cursor.col));
      }
      setData((prev) => {
        const copy = { ...prev };
        for (const ref of refs) {
          copy[ref] = updater(copy[ref] ?? { value: '' });
        }
        return copy;
      });
    },
    [selection, cursor, setData],
  );

  const toggleBold = () => {
    const next = !toolBold;
    setToolBold(next);
    applyFormat((c) => ({ ...c, bold: next }));
  };

  const toggleItalic = () => {
    const next = !toolItalic;
    setToolItalic(next);
    applyFormat((c) => ({ ...c, italic: next }));
  };

  const setAlign = (a: 'left' | 'center' | 'right') => {
    setToolAlign(a);
    applyFormat((c) => ({ ...c, align: a }));
  };

  const applyTextColor = (color: string) => {
    setToolTextColor(color);
    applyFormat((c) => ({ ...c, textColor: color || undefined }));
  };

  const applyBgColor = (color: string) => {
    setToolBgColor(color);
    applyFormat((c) => ({ ...c, bgColor: color || undefined }));
  };

  // ---- Add sheet ----
  const addSheet = () => {
    let i = sheetNames.length + 1;
    let name = `Sheet${i}`;
    while (sheetNames.includes(name)) { i++; name = `Sheet${i}`; }
    setSheetNames((prev) => [...prev, name]);
    setAllData((prev) => ({ ...prev, [name]: {} }));
    setActiveSheet(name);
  };

  // ---- Formula bar ----
  const cursorRef = cellRef(cursor.row, cursor.col);
  const cursorCell = data[cursorRef];
  const formulaBarValue = editing
    ? editValue
    : cursorCell?.formula
      ? `=${cursorCell.formula}`
      : cursorCell?.value ?? '';

  // ---- Scroll handler ----
  const handleScroll = useCallback(() => {
    const el = gridRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
      setScrollLeft(el.scrollLeft);
    }
  }, []);

  // Ensure cursor is scrolled into view
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cellTop = cursor.row * ROW_HEIGHT;
    const cellLeft = colOffsets[cursor.col];
    const cellRight = colOffsets[cursor.col + 1] ?? cellLeft + DEFAULT_COL_WIDTH;
    const cellBottom = cellTop + ROW_HEIGHT;

    if (cellTop < el.scrollTop) el.scrollTop = cellTop;
    if (cellBottom > el.scrollTop + viewportH - HEADER_HEIGHT)
      el.scrollTop = cellBottom - viewportH + HEADER_HEIGHT;
    if (cellLeft < el.scrollLeft) el.scrollLeft = cellLeft;
    if (cellRight > el.scrollLeft + viewportW - ROW_HEADER_WIDTH)
      el.scrollLeft = cellRight - viewportW + ROW_HEADER_WIDTH;
  }, [cursor, colOffsets, viewportH, viewportW]);

  // ---- Render ----
  const rows: React.ReactNode[] = [];
  for (let r = visibleRows.first; r <= visibleRows.last; r++) {
    const cells: React.ReactNode[] = [];
    for (let c = visibleCols.first; c <= visibleCols.last; c++) {
      const ref = cellRef(r, c);
      const cell = data[ref];
      const display = computeDisplay(cell, data);
      const isCursor = cursor.row === r && cursor.col === c;
      const inSel = isInSelection(r, c, selection);

      const cellStyle: CSSProperties = {
        position: 'absolute',
        top: 0,
        left: colOffsets[c],
        width: colWidths[c],
        height: ROW_HEIGHT,
        boxSizing: 'border-box',
        borderRight: `1px solid ${T.borderSubtle}`,
        borderBottom: `1px solid ${T.borderSubtle}`,
        padding: '0 6px',
        display: 'flex',
        alignItems: 'center',
        fontSize: toolFontSize,
        fontWeight: cell?.bold ? 700 : 400,
        fontStyle: cell?.italic ? 'italic' : 'normal',
        textAlign: cell?.align ?? 'left',
        justifyContent:
          cell?.align === 'center' ? 'center' : cell?.align === 'right' ? 'flex-end' : 'flex-start',
        color: cell?.textColor || T.textPrimary,
        backgroundColor: inSel
          ? 'rgba(212,165,116,0.12)'
          : cell?.bgColor || 'transparent',
        outline: isCursor ? `2px solid ${T.accent}` : 'none',
        outlineOffset: '-2px',
        cursor: 'cell',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        userSelect: 'none',
        zIndex: isCursor ? 2 : 1,
      };

      if (editing && isCursor) {
        cells.push(
          <div key={ref} style={cellStyle}>
            <input
              ref={editInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit()}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: T.textPrimary,
                fontFamily: T.font,
                fontSize: 'inherit',
                fontWeight: 'inherit',
                fontStyle: 'inherit',
                padding: 0,
              }}
            />
          </div>,
        );
      } else {
        cells.push(
          <div
            key={ref}
            style={cellStyle}
            onMouseDown={(e) => handleCellMouseDown(r, c, e)}
            onMouseEnter={() => handleCellMouseEnter(r, c)}
            onDoubleClick={() => handleCellDoubleClick(r, c)}
          >
            {display}
          </div>,
        );
      }
    }

    rows.push(
      <div
        key={`row-${r}`}
        style={{
          position: 'absolute',
          top: r * ROW_HEIGHT,
          left: 0,
          width: totalWidth,
          height: ROW_HEIGHT,
        }}
      >
        {cells}
      </div>,
    );
  }

  // ---- Column headers ----
  const colHeaders: React.ReactNode[] = [];
  for (let c = visibleCols.first; c <= visibleCols.last; c++) {
    colHeaders.push(
      <div
        key={`ch-${c}`}
        style={{
          position: 'absolute',
          left: colOffsets[c] + ROW_HEADER_WIDTH,
          top: 0,
          width: colWidths[c],
          height: HEADER_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: T.textSecondary,
          backgroundColor: T.surfaceElevated,
          borderRight: `1px solid ${T.borderSubtle}`,
          borderBottom: `1px solid ${T.borderSubtle}`,
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        {colIndexToLetter(c)}
        {/* Resize handle */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 5,
            height: '100%',
            cursor: 'col-resize',
          }}
          onMouseDown={(e) => startColResize(c, e)}
          onDoubleClick={() => autoFitCol(c)}
        />
      </div>,
    );
  }

  // ---- Row headers ----
  const rowHeaders: React.ReactNode[] = [];
  for (let r = visibleRows.first; r <= visibleRows.last; r++) {
    rowHeaders.push(
      <div
        key={`rh-${r}`}
        style={{
          position: 'absolute',
          left: 0,
          top: r * ROW_HEIGHT + HEADER_HEIGHT,
          width: ROW_HEADER_WIDTH,
          height: ROW_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 500,
          color: T.textSecondary,
          backgroundColor: T.surfaceElevated,
          borderRight: `1px solid ${T.borderSubtle}`,
          borderBottom: `1px solid ${T.borderSubtle}`,
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        {r + 1}
      </div>,
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: T.surfaceBase,
        fontFamily: T.font,
        color: T.textPrimary,
        overflow: 'hidden',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ========== Toolbar ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          backgroundColor: T.surfaceElevated,
          borderBottom: `1px solid ${T.borderSubtle}`,
          flexShrink: 0,
          flexWrap: 'wrap',
          minHeight: 36,
        }}
      >
        {/* Font size */}
        <select
          value={toolFontSize}
          onChange={(e) => setToolFontSize(Number(e.target.value))}
          style={{
            background: T.surfaceBase,
            color: T.textPrimary,
            border: `1px solid ${T.borderSubtle}`,
            borderRadius: 4,
            padding: '2px 4px',
            fontSize: 12,
            fontFamily: T.font,
          }}
        >
          {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <ToolbarDivider />

        {/* Bold */}
        <ToolbarButton
          active={toolBold}
          onClick={toggleBold}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>

        {/* Italic */}
        <ToolbarButton
          active={toolItalic}
          onClick={toggleItalic}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>

        <ToolbarDivider />

        {/* Alignment */}
        <ToolbarButton active={toolAlign === 'left'} onClick={() => setAlign('left')} title="Align Left">
          <AlignIcon type="left" />
        </ToolbarButton>
        <ToolbarButton active={toolAlign === 'center'} onClick={() => setAlign('center')} title="Align Center">
          <AlignIcon type="center" />
        </ToolbarButton>
        <ToolbarButton active={toolAlign === 'right'} onClick={() => setAlign('right')} title="Align Right">
          <AlignIcon type="right" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text color */}
        <label
          title="Text Color"
          style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', fontSize: 12 }}
        >
          <span style={{ color: toolTextColor || T.textPrimary, fontWeight: 700 }}>A</span>
          <input
            type="color"
            value={toolTextColor || '#e8e0d8'}
            onChange={(e) => applyTextColor(e.target.value)}
            style={{ width: 16, height: 16, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          />
        </label>

        {/* Background color */}
        <label
          title="Background Color"
          style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', fontSize: 12 }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              backgroundColor: toolBgColor || T.surfaceBase,
              border: `1px solid ${T.borderSubtle}`,
              borderRadius: 2,
            }}
          />
          <input
            type="color"
            value={toolBgColor || '#1a1614'}
            onChange={(e) => applyBgColor(e.target.value)}
            style={{ width: 16, height: 16, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          />
        </label>
      </div>

      {/* ========== Formula Bar ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 8px',
          backgroundColor: T.surfaceElevated,
          borderBottom: `1px solid ${T.borderSubtle}`,
          flexShrink: 0,
          height: 30,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: T.textSecondary,
            minWidth: 40,
            textAlign: 'center',
          }}
        >
          {cursorRef}
        </span>
        <div
          style={{
            width: 1,
            height: 18,
            backgroundColor: T.borderSubtle,
          }}
        />
        <span style={{ fontSize: 12, color: T.textSecondary, flexShrink: 0 }}>
          <em>f</em><sub>x</sub>
        </span>
        <input
          ref={formulaInputRef}
          value={formulaBarValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            if (!editing) setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit(editValue);
              gridRef.current?.parentElement?.focus();
            } else if (e.key === 'Escape') {
              setEditing(false);
              gridRef.current?.parentElement?.focus();
            }
          }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: T.textPrimary,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          placeholder="Enter value or formula..."
        />
      </div>

      {/* ========== Grid area ========== */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Column headers (sticky top) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: HEADER_HEIGHT,
            zIndex: 10,
            overflow: 'hidden',
          }}
        >
          {/* Corner cell */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: ROW_HEADER_WIDTH,
              height: HEADER_HEIGHT,
              backgroundColor: T.surfaceElevated,
              borderRight: `1px solid ${T.borderSubtle}`,
              borderBottom: `1px solid ${T.borderSubtle}`,
              zIndex: 12,
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: -scrollLeft,
              height: HEADER_HEIGHT,
              width: totalWidth + ROW_HEADER_WIDTH,
            }}
          >
            {colHeaders}
          </div>
        </div>

        {/* Row headers (sticky left) */}
        <div
          style={{
            position: 'absolute',
            top: -scrollTop,
            left: 0,
            width: ROW_HEADER_WIDTH,
            height: totalHeight + HEADER_HEIGHT,
            zIndex: 9,
          }}
        >
          {rowHeaders}
        </div>

        {/* Scrollable grid */}
        <div
          ref={gridRef}
          onScroll={handleScroll}
          style={{
            position: 'absolute',
            top: HEADER_HEIGHT,
            left: ROW_HEADER_WIDTH,
            right: 0,
            bottom: 0,
            overflow: 'auto',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: totalWidth,
              height: totalHeight,
            }}
          >
            {rows}
          </div>
        </div>
      </div>

      {/* ========== Sheet tabs ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '0 4px',
          backgroundColor: T.surfaceElevated,
          borderTop: `1px solid ${T.borderSubtle}`,
          flexShrink: 0,
          height: 32,
          overflow: 'auto',
        }}
      >
        {sheetNames.map((name) => (
          <button
            key={name}
            onClick={() => {
              if (editing) commitEdit();
              setActiveSheet(name);
            }}
            style={{
              padding: '4px 16px',
              fontSize: 12,
              fontFamily: T.font,
              color: name === activeSheet ? T.textPrimary : T.textSecondary,
              backgroundColor: name === activeSheet ? T.surfaceBase : 'transparent',
              border: 'none',
              borderRight: `1px solid ${T.borderSubtle}`,
              borderTop: name === activeSheet ? `2px solid ${T.accent}` : '2px solid transparent',
              cursor: 'pointer',
              height: '100%',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </button>
        ))}
        <button
          onClick={addSheet}
          style={{
            padding: '4px 10px',
            fontSize: 14,
            fontFamily: T.font,
            color: T.textSecondary,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            height: '100%',
          }}
          title="Add sheet"
        >
          +
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

const ToolbarButton: React.FC<{
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: 4,
      border: 'none',
      cursor: 'pointer',
      color: active ? T.textPrimary : T.textSecondary,
      backgroundColor: active ? 'rgba(212,165,116,0.18)' : 'transparent',
      fontFamily: T.font,
      fontSize: 14,
    }}
  >
    {children}
  </button>
);

const ToolbarDivider: React.FC = () => (
  <div
    style={{
      width: 1,
      height: 20,
      backgroundColor: T.borderSubtle,
      margin: '0 4px',
    }}
  />
);

const AlignIcon: React.FC<{ type: 'left' | 'center' | 'right' }> = ({ type }) => {
  const w1 = type === 'left' ? 12 : type === 'center' ? 10 : 12;
  const w2 = type === 'left' ? 8 : type === 'center' ? 12 : 8;
  const w3 = type === 'left' ? 10 : type === 'center' ? 8 : 10;
  const align = type === 'left' ? 'flex-start' : type === 'center' ? 'center' : 'flex-end';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: align }}>
      <div style={{ width: w1, height: 1.5, backgroundColor: 'currentColor', borderRadius: 1 }} />
      <div style={{ width: w2, height: 1.5, backgroundColor: 'currentColor', borderRadius: 1 }} />
      <div style={{ width: w3, height: 1.5, backgroundColor: 'currentColor', borderRadius: 1 }} />
    </div>
  );
};

export default SpreadsheetApp;
