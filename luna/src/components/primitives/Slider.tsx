import { useState } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/inputs.css';

/** Range slider with min/max/step. */
export function Slider({ id, props, onEvent }: PrimitiveProps) {
  const [value, setValue] = useState(props.value ?? props.defaultValue ?? 50);
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const step = props.step ?? 1;

  return (
    <div className={`luna-slider ${props.disabled ? 'luna-slider--disabled' : ''}`} id={id}>
      {props.label && <label className="luna-slider__label">{props.label}</label>}
      <div className="luna-slider__row">
        <input
          type="range"
          className="luna-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={props.disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setValue(v);
            onEvent('onChange', { value: v });
          }}
        />
        {props.showValue !== false && (
          <span className="luna-slider__value">{value}</span>
        )}
      </div>
    </div>
  );
}
