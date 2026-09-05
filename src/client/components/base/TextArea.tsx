import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextAreaVariant = "default" | "filled" | "ghost";
export type TextAreaSize = "sm" | "md" | "lg";

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: TextAreaSize;
  variant?: TextAreaVariant;
  fullWidth?: boolean;
  containerClassName?: string;
  characterCount?: number;
  maxCharacterCount?: number;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    label,
    error,
    helperText,
    size = "md",
    variant = "default",
    fullWidth = true,
    containerClassName = "",
    className = "",
    id,
    disabled,
    characterCount,
    maxCharacterCount,
    rows = 3,
    ...textareaProps
  },
  ref
) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
  const errorId = textareaId && error ? `${textareaId}-error` : undefined;
  const helperId = textareaId && helperText && !error ? `${textareaId}-helper` : undefined;
  const describedBy = errorId || helperId || undefined;

  return (
    <label
      className={`base-form-field form-field ${fullWidth ? "base-form-field--full" : ""} ${disabled ? "base-form-field--disabled" : ""} ${containerClassName}`.trim()}
      htmlFor={textareaId}
    >
      {label && (
        <div className="field-label-row flex items-center justify-between">
          <span className="field-label-text">{label}</span>
          {characterCount !== undefined && (
            <span className="field-counter-text">
              {characterCount}
              {maxCharacterCount !== undefined ? ` / ${maxCharacterCount}` : ""}
            </span>
          )}
        </div>
      )}
      <div className="base-form-input-wrapper">
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`base-form-input base-form-textarea form-input base-form-input--${variant} base-form-input--${size} ${error ? "base-form-input--error has-error" : ""} ${className}`.trim()}
          {...textareaProps}
        />
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

export default TextArea;
