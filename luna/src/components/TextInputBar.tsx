import { useState, useRef, useCallback } from 'react';
import { sendMessage } from '../ipc/agent';
import { useAgentStore } from '../stores/agentStore';
import { StatusIndicator } from './StatusIndicator';

export function TextInputBar() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setStatus = useAgentStore((s) => s.setStatus);
  const hasConductor = useAgentStore((s) => s.hasConductor);

  const handleSubmit = useCallback(async () => {
    const text = value.trim();
    if (!text) return;

    setValue('');
    setStatus('working');

    try {
      await sendMessage(text);
      setStatus('idle');
    } catch (e) {
      console.error('Failed to send message:', e);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }

    // Keep focus
    inputRef.current?.focus();
  }, [value, setStatus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="input-bar">
      <div className="input-bar__context">
        {hasConductor ? 'Conductor' : 'No Agent'}
      </div>
      <input
        ref={inputRef}
        className="input-bar__field"
        type="text"
        placeholder="Describe a task..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className="input-bar__status">
        <StatusIndicator />
      </div>
    </div>
  );
}
