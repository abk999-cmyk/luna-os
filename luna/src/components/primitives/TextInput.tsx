import { useState, useEffect } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/inputs.css';

/** Text input with label, placeholder, and validation support. */
export function TextInput({ id, props, onEvent }: PrimitiveProps) {
  const [value, setValue] = useState(props.value ?? props.defaultValue ?? '');

  // M9: Sync internal state when external props.value changes
  useEffect(() => {
    if (props.value !== undefined) setValue(props.value);
  }, [props.value]);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);

    // Basic validation
    if (props.required && !val.trim()) {
      setError('Required');
    } else if (props.maxLength && val.length > props.maxLength) {
      setError(`Max ${props.maxLength} characters`);
    } else {
      setError(null);
    }

    onEvent('onChange', { value: val });
  };

  const isTextarea = props.multiline || props.type === 'textarea';

  return (
    <div className={`luna-input ${error ? 'luna-input--error' : ''} ${props.disabled ? 'luna-input--disabled' : ''}`} id={id}>
      {props.label && <label className="luna-input__label">{props.label}</label>}
      {isTextarea ? (
        <textarea
          className="luna-input__field luna-input__field--textarea"
          placeholder={props.placeholder}
          value={value}
          disabled={props.disabled}
          rows={props.rows || 3}
          onChange={handleChange}
          onBlur={() => onEvent('onBlur', { value })}
          onFocus={() => onEvent('onFocus', { value })}
        />
      ) : (
        <input
          className="luna-input__field"
          type={props.type || 'text'}
          placeholder={props.placeholder}
          value={value}
          disabled={props.disabled}
          onChange={handleChange}
          onBlur={() => onEvent('onBlur', { value })}
          onFocus={() => onEvent('onFocus', { value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEvent('onSubmit', { value });
          }}
        />
      )}
      {props.helperText && !error && <span className="luna-input__helper">{props.helperText}</span>}
      {error && <span className="luna-input__error">{error}</span>}
    </div>
  );
}
