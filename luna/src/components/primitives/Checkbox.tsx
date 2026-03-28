import { useState, useEffect } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/inputs.css';

/** Checkbox with label. */
export function Checkbox({ id, props, onEvent }: PrimitiveProps) {
  const [checked, setChecked] = useState(props.checked ?? props.defaultChecked ?? false);

  // M9: Sync internal state when external props.checked changes
  useEffect(() => {
    if (props.checked !== undefined) setChecked(props.checked);
  }, [props.checked]);

  const handleChange = () => {
    if (props.disabled) return;
    const next = !checked;
    setChecked(next);
    onEvent('onChange', { checked: next });
  };

  return (
    <label className={`luna-checkbox ${props.disabled ? 'luna-checkbox--disabled' : ''}`} id={id}>
      <input
        type="checkbox"
        className="luna-checkbox__input"
        checked={checked}
        disabled={props.disabled}
        onChange={handleChange}
      />
      <span className="luna-checkbox__box" />
      {props.label && <span className="luna-checkbox__label">{props.label}</span>}
    </label>
  );
}

/** Toggle switch variant. */
export function Toggle({ id, props, onEvent }: PrimitiveProps) {
  const [on, setOn] = useState(props.value ?? props.defaultValue ?? false);

  // Sync internal state when external props.value changes (mirrors Checkbox pattern)
  useEffect(() => {
    if (props.value !== undefined) setOn(props.value);
  }, [props.value]);

  const handleToggle = () => {
    if (props.disabled) return;
    const next = !on;
    setOn(next);
    onEvent('onChange', { value: next });
  };

  return (
    <label className={`luna-toggle ${on ? 'luna-toggle--on' : ''} ${props.disabled ? 'luna-toggle--disabled' : ''}`} id={id}>
      <button
        type="button"
        className="luna-toggle__track"
        role="switch"
        aria-checked={on}
        disabled={props.disabled}
        onClick={handleToggle}
      >
        <span className="luna-toggle__thumb" />
      </button>
      {props.label && <span className="luna-toggle__label">{props.label}</span>}
    </label>
  );
}
