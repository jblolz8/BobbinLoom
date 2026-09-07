import { forwardRef, useEffect, useRef, type TextareaHTMLAttributes } from "react";

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
  /** Opt-in: grow the field height to fit its content instead of a fixed `rows`. */
  autoGrow?: boolean;
  /** When `autoGrow`, hard cap the grown height (px). Past the cap the field scrolls internally. */
  autoGrowMax?: number;
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
    autoGrow = false,
    autoGrowMax,
    value,
    ...textareaProps
  },
  forwardedRef
) {
  const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
  const errorId = textareaId && error ? `${textareaId}-error` : undefined;
  const helperId = textareaId && helperText && !error ? `${textareaId}-helper` : undefined;
  const describedBy = errorId || helperId || undefined;

  // Measure ref so auto-grow sizing never steals the parent's forwarded ref.
  const measureRef = useRef<HTMLTextAreaElement | null>(null);
  // Baseline height (the initial `rows` visual) captured before any inline sizing.
  const baselineRef = useRef<number | null>(null);

  const setRef = (node: HTMLTextAreaElement | null) => {
    measureRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  // Resize on mount AND on every value change (handles paste, imports, clear).
  useEffect(() => {
    if (!autoGrow) return;
    const el = measureRef.current;
    if (!el) return;
    // First run: remember the CSS `rows`-based height as the floor so an empty
    // field doesn't collapse to a single line.
    if (baselineRef.current === null) baselineRef.current = el.clientHeight;

    el.style.height = "auto";
    const content = el.scrollHeight;
    const grown = Math.max(content, baselineRef.current);
    const capped = autoGrowMax ? Math.min(grown, autoGrowMax) : grown;
    el.style.height = `${capped}px`;
    // Flip to scroll only once content passes the cap (keeps layout stable).
    el.style.overflowY = autoGrowMax && content > autoGrowMax ? "auto" : "hidden";
  }, [autoGrow, autoGrowMax, value]);

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
          ref={setRef}
          id={textareaId}
          disabled={disabled}
          rows={rows}
          value={value}
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
