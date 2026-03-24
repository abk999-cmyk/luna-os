import { useState } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/inputs.css';

/** Numeric input with min/max/step constraints. */
export function NumberInput({ id, props, onEvent }: PrimitiveProps) {
  const [value, setValue] = useState<number>(props.value ?? props.defaultValue ?? 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      setValue(0);
      return;
    }
    let num = parseFloat(raw);
    if (isNaN(num)) return;
    if (props.min !== undefined) num = Math.max(props.min, num);
    if (props.max !== undefined) num = Math.min(props.max, num);
    setValue(num);
    onEvent('onChange', { value: num });
  };

  return (
    <div className={`luna-input ${props.disabled ? 'luna-input--disabled' : ''}`} id={id}>
      {props.label && <label className="luna-input__label">{props.label}</label>}
      <input
        className="luna-input__field"
        type="number"
        value={value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        disabled={props.disabled}
        onChange={handleChange}
        onBlur={() => onEvent('onBlur', { value })}
      />
      {props.helperText && <span className="luna-input__helper">{props.helperText}</span>}
    </div>
  );
}
