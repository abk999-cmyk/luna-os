import React, { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CalculatorProps {
  mode?: 'standard' | 'scientific';
  history?: string[];
}

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
    minWidth: 300,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    background: 'var(--surface-elevated, #2a2420)',
    flexShrink: 0,
  },
  modeToggle: {
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--font-system, system-ui)',
  },
  modeActive: {
    background: 'rgba(212,165,116,0.15)',
    borderColor: 'var(--color-accent, #d4a574)',
    color: 'var(--color-accent, #d4a574)',
  },
  display: {
    padding: '16px 18px 12px',
    textAlign: 'right',
    borderBottom: '1px solid var(--border-subtle, #3a332e)',
    flexShrink: 0,
  },
  expression: {
    fontSize: 14,
    color: 'var(--text-secondary, #b0a898)',
    minHeight: 20,
    marginBottom: 4,
    fontFamily: 'var(--font-mono, monospace)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  result: {
    fontSize: 32,
    fontWeight: 600,
    fontFamily: 'var(--font-mono, monospace)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  historyPanel: {
    width: 160,
    borderRight: '1px solid var(--border-subtle, #3a332e)',
    overflowY: 'auto',
    padding: 8,
    flexShrink: 0,
  },
  historyTitle: {
    fontSize: 11,
    color: 'var(--text-tertiary, #6a6058)',
    padding: '4px 6px',
    fontWeight: 600,
  },
  historyItem: {
    fontSize: 12,
    color: 'var(--text-secondary, #b0a898)',
    padding: '4px 6px',
    fontFamily: 'var(--font-mono, monospace)',
    borderRadius: 4,
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grid: {
    flex: 1,
    display: 'grid',
    gap: 1,
    padding: 6,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface-elevated, #2a2420)',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 8,
    color: 'var(--text-primary, #e8e0d8)',
    fontSize: 16,
    fontFamily: 'var(--font-system, system-ui)',
    cursor: 'pointer',
    padding: '10px 0',
    transition: 'background 0.1s',
    userSelect: 'none',
  },
  btnOp: {
    color: 'var(--color-accent, #d4a574)',
  },
  btnAccent: {
    background: 'var(--color-accent, #d4a574)',
    color: '#1a1614',
    fontWeight: 600,
  },
  btnDark: {
    background: 'rgba(255,255,255,0.04)',
  },
  memoryRow: {
    display: 'flex',
    gap: 1,
    padding: '0 6px 4px',
    flexShrink: 0,
  },
  memBtn: {
    flex: 1,
    background: 'none',
    border: '1px solid var(--border-subtle, #3a332e)',
    borderRadius: 6,
    color: 'var(--text-secondary, #b0a898)',
    fontSize: 11,
    fontFamily: 'var(--font-system, system-ui)',
    cursor: 'pointer',
    padding: '5px 0',
  },
};

/* ------------------------------------------------------------------ */
/*  Calculator logic                                                   */
/* ------------------------------------------------------------------ */

function safeEval(expr: string): number {
  // Replace display symbols with JS operators
  let sanitized = expr
    .replace(/\u00d7/g, '*')
    .replace(/\u00f7/g, '/')
    .replace(/\u03c0/g, `${Math.PI}`)
    .replace(/e(?![0-9])/g, `${Math.E}`)
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/tan\(/g, 'Math.tan(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/\^/g, '**');

  // Validate - only allow safe characters
  if (/[^0-9+\-*/().%\s,Mathsincotalgqrpe*]/.test(sanitized.replace(/Math\.\w+/g, ''))) {
    throw new Error('Invalid expression');
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${sanitized})`);
  return fn();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CalculatorApp({ mode: modeProp = 'standard', history: histProp }: CalculatorProps) {
  // External prop sync refs
  const isInternalEdit = useRef(false);
  const lastExternalProps = useRef<string>(JSON.stringify({ modeProp, histProp }));

  const [mode, setMode] = useState<'standard' | 'scientific'>(modeProp);
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState<string[]>(histProp ?? []);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [memory, setMemory] = useState(0);

  // Sync external prop changes
  useEffect(() => {
    const serialized = JSON.stringify({ modeProp, histProp });
    if (serialized === lastExternalProps.current) return;
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    lastExternalProps.current = serialized;
    setMode(modeProp);
    if (histProp) setHistory(histProp);
  }, [modeProp, histProp]);

  const appendDigit = useCallback((d: string) => {
    if (justEvaluated) {
      setDisplay(d);
      setExpression('');
      setJustEvaluated(false);
    } else {
      setDisplay(prev => (prev === '0' && d !== '.') ? d : prev + d);
    }
  }, [justEvaluated]);

  const appendOp = useCallback((op: string) => {
    setExpression(prev => {
      const base = justEvaluated ? display : (prev ? prev : display);
      return `${base} ${op} `;
    });
    setDisplay('0');
    setJustEvaluated(false);
  }, [display, justEvaluated]);

  const calculate = useCallback(() => {
    try {
      const full = expression + display;
      const result = safeEval(full);
      const formatted = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
      isInternalEdit.current = true;
      setHistory(prev => [`${full} = ${formatted}`, ...prev].slice(0, 50));
      setDisplay(formatted);
      setExpression('');
      setJustEvaluated(true);
    } catch {
      setDisplay('Error');
      setJustEvaluated(true);
    }
  }, [expression, display]);

  const clear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setJustEvaluated(false);
  }, []);

  const clearEntry = useCallback(() => {
    setDisplay('0');
  }, []);

  const toggleSign = useCallback(() => {
    setDisplay(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
  }, []);

  const percent = useCallback(() => {
    setDisplay(prev => String(parseFloat(prev) / 100));
  }, []);

  const backspace = useCallback(() => {
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  }, []);

  const sciFunc = useCallback((fn: string) => {
    setDisplay(`${fn}(${display})`);
  }, [display]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') appendDigit(e.key);
      else if (e.key === '.') appendDigit('.');
      else if (e.key === '+') appendOp('+');
      else if (e.key === '-') appendOp('-');
      else if (e.key === '*') appendOp('\u00d7');
      else if (e.key === '/') { e.preventDefault(); appendOp('\u00f7'); }
      else if (e.key === 'Enter' || e.key === '=') calculate();
      else if (e.key === 'Escape') clear();
      else if (e.key === 'Backspace') backspace();
      else if (e.key === '%') percent();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appendDigit, appendOp, calculate, clear, backspace, percent]);

  const stdButtons: { label: string; action: () => void; style?: React.CSSProperties }[] = [
    { label: 'C', action: clear, style: S.btnDark },
    { label: 'CE', action: clearEntry, style: S.btnDark },
    { label: '%', action: percent, style: S.btnDark },
    { label: '\u00f7', action: () => appendOp('\u00f7'), style: S.btnOp },
    { label: '7', action: () => appendDigit('7') },
    { label: '8', action: () => appendDigit('8') },
    { label: '9', action: () => appendDigit('9') },
    { label: '\u00d7', action: () => appendOp('\u00d7'), style: S.btnOp },
    { label: '4', action: () => appendDigit('4') },
    { label: '5', action: () => appendDigit('5') },
    { label: '6', action: () => appendDigit('6') },
    { label: '\u2212', action: () => appendOp('-'), style: S.btnOp },
    { label: '1', action: () => appendDigit('1') },
    { label: '2', action: () => appendDigit('2') },
    { label: '3', action: () => appendDigit('3') },
    { label: '+', action: () => appendOp('+'), style: S.btnOp },
    { label: '+/\u2212', action: toggleSign },
    { label: '0', action: () => appendDigit('0') },
    { label: '.', action: () => appendDigit('.') },
    { label: '=', action: calculate, style: S.btnAccent },
  ];

  const sciButtons: { label: string; action: () => void }[] = [
    { label: 'sin', action: () => sciFunc('sin') },
    { label: 'cos', action: () => sciFunc('cos') },
    { label: 'tan', action: () => sciFunc('tan') },
    { label: 'log', action: () => sciFunc('log') },
    { label: 'ln', action: () => sciFunc('ln') },
    { label: '\u221a', action: () => sciFunc('sqrt') },
    { label: 'x\u00b2', action: () => setDisplay(prev => `(${prev})^2`) },
    { label: 'x\u02b8', action: () => appendOp('^') },
    { label: '\u03c0', action: () => appendDigit('\u03c0') },
    { label: 'e', action: () => appendDigit('e') },
    { label: '(', action: () => appendDigit('(') },
    { label: ')', action: () => appendDigit(')') },
  ];

  const cols = mode === 'scientific' ? 5 : 4;

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ fontWeight: 600 }}>Calculator</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={{ ...S.modeToggle, ...(mode === 'standard' ? S.modeActive : {}) }}
            onClick={() => setMode('standard')}
          >
            Standard
          </button>
          <button
            style={{ ...S.modeToggle, ...(mode === 'scientific' ? S.modeActive : {}) }}
            onClick={() => setMode('scientific')}
          >
            Scientific
          </button>
        </div>
      </div>

      {/* Display */}
      <div style={S.display}>
        <div style={S.expression}>{expression || '\u00a0'}</div>
        <div style={S.result}>{display}</div>
      </div>

      {/* Memory buttons */}
      <div style={S.memoryRow}>
        <button style={S.memBtn} onClick={() => setMemory(0)}>MC</button>
        <button style={S.memBtn} onClick={() => { setDisplay(String(memory)); setJustEvaluated(true); }}>MR</button>
        <button style={S.memBtn} onClick={() => setMemory(m => m + parseFloat(display) || m)}>M+</button>
        <button style={S.memBtn} onClick={() => setMemory(m => m - (parseFloat(display) || 0))}>M-</button>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* History */}
        <div style={S.historyPanel}>
          <div style={S.historyTitle}>History</div>
          {history.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary, #6a6058)', padding: '8px 6px' }}>
              No history yet
            </div>
          )}
          {history.map((h, i) => (
            <div
              key={i}
              style={S.historyItem}
              title={h}
              onClick={() => {
                const val = h.split('=').pop()?.trim();
                if (val) { setDisplay(val); setJustEvaluated(true); }
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,165,116,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div
          style={{
            ...S.grid,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            flex: 1,
          }}
        >
          {/* Scientific row */}
          {mode === 'scientific' &&
            sciButtons.map(b => (
              <button
                key={b.label}
                style={{ ...S.btn, ...S.btnDark, fontSize: 13 }}
                onClick={b.action}
                onMouseDown={e => { e.currentTarget.style.background = 'rgba(212,165,116,0.15)'; }}
                onMouseUp={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                {b.label}
              </button>
            ))}

          {/* Standard grid - need to lay out to fill the columns correctly */}
          {mode === 'scientific' ? (
            // In scientific mode, standard buttons in right 4 cols
            // We render all standard buttons after sci buttons; grid will flow them
            stdButtons.map(b => (
              <button
                key={b.label}
                style={{ ...S.btn, ...(b.style ?? {}) }}
                onClick={b.action}
                onMouseDown={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? '#c49564'
                    : 'rgba(212,165,116,0.15)';
                }}
                onMouseUp={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? 'var(--color-accent, #d4a574)'
                    : b.style === S.btnDark ? 'rgba(255,255,255,0.04)'
                    : 'var(--surface-elevated, #2a2420)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? 'var(--color-accent, #d4a574)'
                    : b.style === S.btnDark ? 'rgba(255,255,255,0.04)'
                    : 'var(--surface-elevated, #2a2420)';
                }}
              >
                {b.label}
              </button>
            ))
          ) : (
            stdButtons.map(b => (
              <button
                key={b.label}
                style={{ ...S.btn, ...(b.style ?? {}) }}
                onClick={b.action}
                onMouseDown={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? '#c49564'
                    : 'rgba(212,165,116,0.15)';
                }}
                onMouseUp={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? 'var(--color-accent, #d4a574)'
                    : b.style === S.btnDark ? 'rgba(255,255,255,0.04)'
                    : 'var(--surface-elevated, #2a2420)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = b.style === S.btnAccent
                    ? 'var(--color-accent, #d4a574)'
                    : b.style === S.btnDark ? 'rgba(255,255,255,0.04)'
                    : 'var(--surface-elevated, #2a2420)';
                }}
              >
                {b.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CalculatorApp;
