import { useState, useRef, useEffect } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/containers.css';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/** Chat interface with message list and input. */
export function Chat({ id, props, onEvent }: PrimitiveProps) {
  const messages: ChatMessage[] = props.messages || [];
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    onEvent('onSendMessage', { content: text });
  };

  return (
    <div className="luna-chat" id={id}>
      <div className="luna-chat__messages">
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`luna-chat__message luna-chat__message--${msg.role}`}>
            <div className="luna-chat__role">{msg.role}</div>
            <div className="luna-chat__content">{msg.content}</div>
            {msg.timestamp && <div className="luna-chat__time">{msg.timestamp}</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {!props.readOnly && (
        <div className="luna-chat__input-row">
          <input
            className="luna-chat__input"
            type="text"
            placeholder={props.placeholder || 'Type a message...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
          <button className="luna-chat__send" onClick={handleSend}>Send</button>
        </div>
      )}
    </div>
  );
}
