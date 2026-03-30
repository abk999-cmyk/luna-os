import { useState, useRef, useCallback, useEffect } from 'react';
import { dispatchAction } from '../ipc/actions';
import { listen } from '@tauri-apps/api/event';
import { GLASS } from './apps/glassStyles';

interface TerminalLine {
  type: 'input' | 'output' | 'ai-input' | 'error' | 'system';
  text: string;
}

interface TerminalViewProps {
  content: string;
}

export function TerminalView({ content }: TerminalViewProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'system', text: 'Luna OS Terminal — type a command or let Luna work here.' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse initial content into lines
  useEffect(() => {
    if (content) {
      const parsed = content.split('\n').filter(Boolean);
      if (parsed.length > 0) {
        setLines(prev => [
          ...prev,
          ...parsed.map(line => ({ type: 'output' as const, text: line }))
        ]);
      }
    }
  }, []); // Only on mount

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Listen for AI-initiated shell commands
  useEffect(() => {
    const unlisten = listen<{ action_type: string; payload?: Record<string, unknown> }>(
      'agent-action',
      (event) => {
        const { action_type, payload } = event.payload;
        if (action_type === 'shell.execute' && payload) {
          const cmd = payload.command as string || '';
          const args = (payload.args as string[]) || [];
          const fullCmd = [cmd, ...args].join(' ');
          setLines(prev => [...prev, { type: 'ai-input', text: fullCmd }]);

          // Show output if available
          if (payload.stdout) {
            const stdout = String(payload.stdout);
            if (stdout.trim()) {
              setLines(prev => [...prev, { type: 'output', text: stdout }]);
            }
          }
          if (payload.stderr) {
            const stderr = String(payload.stderr);
            if (stderr.trim()) {
              setLines(prev => [...prev, { type: 'error', text: stderr }]);
            }
          }
        }
      }
    );
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const executeCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Add to history
    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
    setLines(prev => [...prev, { type: 'input', text: trimmed }]);
    setInputValue('');
    setIsExecuting(true);

    // Parse command and args
    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    try {
      const result = await dispatchAction('shell.execute', {
        command,
        args,
        timeout_ms: 30000,
      });

      // The result comes back through the action system
      // We'll also handle it directly if dispatchAction returns something
      if (result && typeof result === 'object') {
        // Handle direct result if available
      }
    } catch (e: any) {
      setLines(prev => [...prev, { type: 'error', text: `Error: ${e.message || e}` }]);
    } finally {
      setIsExecuting(false);
      inputRef.current?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(inputValue);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInputValue(commandHistory[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setInputValue('');
      } else {
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      if (isExecuting) {
        setIsExecuting(false);
        setLines(prev => [...prev, { type: 'system', text: '^C' }]);
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([{ type: 'system', text: 'Terminal cleared.' }]);
    }
  }, [inputValue, commandHistory, historyIndex, isExecuting, executeCommand]);

  const getPromptColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input': return '#4ade80';      // green for user
      case 'ai-input': return '#7eb8ff';   // blue-white for AI
      case 'error': return '#f87171';       // red for errors
      case 'system': return '#6b7280';      // gray for system
      default: return 'var(--text-primary)'; // default text
    }
  };

  const getPrompt = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input': return '$ ';
      case 'ai-input': return 'luna$ ';
      case 'error': return '';
      case 'system': return '\u2014 ';
      default: return '  ';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: '1.6',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            <span style={{ color: getPromptColor(line.type), userSelect: 'none' }}>
              {getPrompt(line.type)}
            </span>
            <span style={{ color: line.type === 'output' ? 'var(--text-primary)' : getPromptColor(line.type) }}>
              {line.text}
            </span>
          </div>
        ))}
        {isExecuting && (
          <div style={{ color: '#6b7280' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>Running...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderTop: `1px solid ${GLASS.dividerColor}`,
          background: 'rgba(0, 0, 0, 0.3)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#4ade80', marginRight: 8, userSelect: 'none', fontWeight: 500 }}>$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isExecuting ? 'Executing...' : 'Type a command...'}
          disabled={isExecuting}
          autoFocus
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}
