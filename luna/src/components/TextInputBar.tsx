import { useState, useRef, useCallback, useMemo } from 'react';
import { sendMessageStreaming } from '../ipc/agent';
import { useAgentStore } from '../stores/agentStore';
import { useShellStore } from '../stores/shellStore';
import { useWindowStore } from '../stores/windowStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { VoiceWaveform } from './VoiceWaveform';
import { ContextTray } from './ContextTray';

const SWIPE_THRESHOLD = 60;

export function TextInputBar() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setStatus = useAgentStore((s) => s.setStatus);
  const addChatMessage = useAgentStore((s) => s.addChatMessage);
  const contextItems = useShellStore((s) => s.contextTrayItems);
  const clearContextItems = useShellStore((s) => s.clearContextItems);

  const { startRecording, stopRecording, isRecording, transcript, error: voiceError, analyserNode } = useVoiceInput();
  const agentStatus = useAgentStore((s) => s.status);
  const windows = useWindowStore((s) => s.windows);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  // Swipe tracking
  const touchStartX = useRef<number | null>(null);

  const placeholder = useMemo(() => {
    if (agentStatus === 'streaming') return 'Luna is working...';
    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
    const visibleWindows = windows.filter((w) => w.visibility === 'visible');
    const focusedWindow = windows.find((w) => w.focused);
    if (focusedWindow) return `Ask about "${focusedWindow.title}"...`;
    if (visibleWindows.length > 0) return `${visibleWindows.length} window${visibleWindows.length > 1 ? 's' : ''} open · Ask anything...`;
    if (activeWorkspace?.goal) return `${activeWorkspace.name}: ${activeWorkspace.goal.slice(0, 40)}`;
    return 'Ask anything...';
  }, [agentStatus, windows, workspaces, activeWorkspaceId]);

  const handleSubmit = useCallback(async (text?: string) => {
    const submitText = (text || value).trim();
    if (!submitText) return;

    let fullMessage = submitText;
    if (contextItems.length > 0) {
      const contextBlock = contextItems
        .map((item) => `[File: ${item.filename} (${item.type}, ${item.size}B)]\n${item.content}`)
        .join('\n\n');
      fullMessage = `${contextBlock}\n\n${submitText}`;
      clearContextItems();
    }

    setValue('');
    addChatMessage('user', submitText);
    setStatus('streaming');

    try {
      await sendMessageStreaming(fullMessage);
    } catch (e) {
      console.error('Failed to send message:', e);
      addChatMessage('assistant', `Error: ${e}`);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }

    inputRef.current?.focus();
  }, [value, setStatus, addChatMessage, contextItems, clearContextItems]);

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
        setTimeout(() => handleSubmit(text), 300);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, handleSubmit]);

  // Swipe right to enter voice mode
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx > SWIPE_THRESHOLD && !isRecording) {
      handleVoiceToggle();
    }
  }, [isRecording, handleVoiceToggle]);

  const displayValue = isRecording && transcript ? transcript : value;

  return (
    <>
      <ContextTray />
      <div
        className={`input-bar ${isRecording ? 'input-bar--recording' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isRecording ? (
          <div className="input-bar__voice-mode" onClick={handleVoiceToggle}>
            <VoiceWaveform analyserNode={analyserNode} isRecording={isRecording} />
            <span className="input-bar__voice-transcript">
              {transcript || 'Listening...'}
            </span>
            <span className="input-bar__voice-stop">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </span>
          </div>
        ) : (
          <input
            ref={inputRef}
            className="input-bar__field"
            type="text"
            placeholder={placeholder}
            value={displayValue}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        )}

        {voiceError && (
          <span className="input-bar__error">
            {voiceError}
          </span>
        )}
      </div>
    </>
  );
}
