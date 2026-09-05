import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export type TextInputVariant = "default" | "filled" | "ghost";
export type TextInputSize = "sm" | "md" | "lg";

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  size?: TextInputSize;
  variant?: TextInputVariant;
  fullWidth?: boolean;
  containerClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    error,
    helperText,
    leftIcon,
    leftElement,
    rightElement,
    size = "md",
    variant = "default",
    fullWidth = true,
    containerClassName = "",
    type = "text",
    className = "",
    id,
    disabled,
    ...inputProps
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
  const errorId = inputId && error ? `${inputId}-error` : undefined;
  const helperId = inputId && helperText && !error ? `${inputId}-helper` : undefined;
  const describedBy = errorId || helperId || undefined;

  return (
    <label
      className={`base-form-field form-field ${fullWidth ? "base-form-field--full" : ""} ${disabled ? "base-form-field--disabled" : ""} ${containerClassName}`.trim()}
      htmlFor={inputId}
    >
      {label && <span className="field-label-text">{label}</span>}
      <div
        className={`field-input-row field-input-row--${size} ${leftElement ? "has-left-action" : ""} ${rightElement ? "has-action has-right-action" : ""}`.trim()}
      >
        {leftElement && <div className="field-input-action field-input-action--left">{leftElement}</div>}
        <div className={`base-form-input-wrapper ${leftIcon ? "has-left-icon" : ""}`}>
          {leftIcon && (
            <span className="base-form-input__icon base-form-input__icon--left" aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={`base-form-input form-input base-form-input--${variant} base-form-input--${size} ${error ? "base-form-input--error has-error" : ""} ${className}`.trim()}
            {...inputProps}
          />
        </div>
        {rightElement && <div className="field-input-action field-input-action--right">{rightElement}</div>}
      </div>
      {error ? (
        <p id={errorId} className="field-error-text" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="field-helper-text">
          {helperText}
        </p>
      ) : null}
    </label>
  );
});
