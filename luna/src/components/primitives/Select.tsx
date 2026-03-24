import { useState } from 'react';
import { PrimitiveProps } from './types';
import '../../styles/primitives/inputs.css';

interface Option {
  value: string;
  label: string;
}

/** Single or multi-select dropdown. */
export function Select({ id, props, onEvent }: PrimitiveProps) {
  const options: Option[] = (props.options || []).map((opt: any) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );
  const multiple = props.multiple ?? false;
  const [value, setValue] = useState<string | string[]>(
    props.value ?? props.defaultValue ?? (multiple ? [] : '')
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (multiple) {
      const selected = Array.from(e.target.selectedOptions, o => o.value);
      setValue(selected);
      onEvent('onChange', { value: selected });
    } else {
      setValue(e.target.value);
      onEvent('onChange', { value: e.target.value });
    }
  };

  return (
    <div className={`luna-input ${props.disabled ? 'luna-input--disabled' : ''}`} id={id}>
      {props.label && <label className="luna-input__label">{props.label}</label>}
      <select
        className="luna-input__field luna-input__field--select"
        value={value as any}
        multiple={multiple}
        disabled={props.disabled}
        onChange={handleChange}
      >
        {!multiple && props.placeholder && (
          <option value="" disabled>{props.placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {props.helperText && <span className="luna-input__helper">{props.helperText}</span>}
    </div>
  );
}
