import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  rightElement?: ReactNode;
  containerClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    error,
    helperText,
    rightElement,
    containerClassName = "",
    type = "text",
    className = "",
    id,
    ...inputProps
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <label className={`form-field ${containerClassName}`.trim()} htmlFor={inputId}>
      {label && <span className="field-label-text">{label}</span>}
      <div className={`field-input-row ${rightElement ? "has-action" : ""}`}>
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`form-input ${className}`.trim()}
          {...inputProps}
        />
        {rightElement && <div className="field-input-action">{rightElement}</div>}
      </div>
      {error ? (
        <p className="field-error-text">{error}</p>
      ) : helperText ? (
        <p className="field-helper-text">{helperText}</p>
      ) : null}
    </label>
  );
});
