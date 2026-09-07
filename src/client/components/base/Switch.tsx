import { forwardRef, type InputHTMLAttributes } from "react";

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional text rendered to the right of the slider. When set, the control
   *  wraps in its own <label>; when omitted it renders a bare control that
   *  relies on an enclosing label (e.g. a SwitchRow) for its accessible name. */
  label?: React.ReactNode;
  /** Extra class for the wrapping element. */
  containerClassName?: string;
}

/**
 * A controlled switch (checkbox + slider) that follows the active custom theme
 * via `var(--accent-*)` tokens. The native checkbox stays in the DOM (opacity 0)
 * so the control remains keyboard-focusable and form-submittable — no ARIA
 * role="switch" re-implementation needed.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    containerClassName = "",
    className = "",
    id,
    disabled,
    ...inputProps
  },
  ref
) {
  const inputId =
    id || (typeof label === "string" ? `switch-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  const classes = `base-switch ${disabled ? "base-switch--disabled" : ""} ${containerClassName}`.trim();

  const inner = (
    <>
      <input
        type="checkbox"
        id={label ? inputId : undefined}
        ref={ref}
        disabled={disabled}
        className={`base-switch__input ${className}`.trim()}
        {...inputProps}
      />
      <span className="base-switch__slider" aria-hidden="true" />
      {label && <span className="base-switch__label">{label}</span>}
    </>
  );

  return label ? (
    <label className={classes} htmlFor={inputId}>
      {inner}
    </label>
  ) : (
    <span className={classes}>{inner}</span>
  );
});
