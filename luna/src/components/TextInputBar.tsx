import { useState, useRef, useCallback } from 'react';
import { sendMessageStreaming } from '../ipc/agent';
import { useAgentStore } from '../stores/agentStore';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { VoiceWaveform } from './VoiceWaveform';
import { StatusIndicator } from './StatusIndicator';
import { ChatPanel } from './ChatPanel';

export function TextInputBar() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setStatus = useAgentStore((s) => s.setStatus);
  const addChatMessage = useAgentStore((s) => s.addChatMessage);
  const hasConductor = useAgentStore((s) => s.hasConductor);

  const { startRecording, stopRecording, isRecording, transcript, error: voiceError, analyserNode } = useVoiceInput();

  const handleSubmit = useCallback(async (text?: string) => {
    const submitText = (text || value).trim();
    if (!submitText) return;

    setValue('');
    addChatMessage('user', submitText);
    setStatus('streaming');

    try {
      await sendMessageStreaming(submitText);
    } catch (e) {
      console.error('Failed to send message:', e);
      addChatMessage('assistant', `Error: ${e}`);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }

    inputRef.current?.focus();
  }, [value, setStatus, addChatMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) {
        setValue(text);
        // Auto-submit after a brief delay so user can see the transcript
        setTimeout(() => handleSubmit(text), 300);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, handleSubmit]);

  // Show live transcript while recording
  const displayValue = isRecording && transcript ? transcript : value;

  return (
    <>
    <ChatPanel />
    <div className="input-bar">
      <div className="input-bar__context">
        {hasConductor ? 'Conductor' : 'No Agent'}
      </div>

      {isRecording ? (
        <div className="input-bar__voice-mode" style={{
          display: 'flex', alignItems: 'center', gap: '8px', flex: 1, padding: '0 8px',
        }}>
          <VoiceWaveform analyserNode={analyserNode} isRecording={isRecording} />
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', flex: 1 }}>
            {transcript || 'Listening...'}
          </span>
        </div>
      ) : (
        <input
          ref={inputRef}
          className="input-bar__field"
          type="text"
          placeholder="Describe a task..."
          value={displayValue}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      )}

      <button
        className="input-bar__voice-btn"
        onClick={handleVoiceToggle}
        title={isRecording ? 'Stop recording' : 'Voice input'}
        style={{
          background: isRecording ? 'var(--color-error, #c44)' : 'transparent',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isRecording ? 'white' : 'var(--color-text-muted)',
          fontSize: '1.1rem',
          transition: 'all 0.15s ease',
        }}
      >
        {isRecording ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {voiceError && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', position: 'absolute', bottom: -16 }}>
          {voiceError}
        </span>
      )}

      <div className="input-bar__status">
        <StatusIndicator />
      </div>
    </div>
    </>
  );
}
