import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    containerClassName = "",
    className = "",
    id,
    disabled,
    ...inputProps
  },
  ref
) {
  const inputId = id || (typeof label === "string" ? `checkbox-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <label
      className={`checkbox-label ${disabled ? "is-disabled" : ""} ${containerClassName}`.trim()}
      htmlFor={inputId}
    >
      <input
        type="checkbox"
        id={inputId}
        ref={ref}
        disabled={disabled}
        className={className}
        {...inputProps}
      />
      {label && <span>{label}</span>}
      {description && <span className="checkbox-description">{description}</span>}
    </label>
  );
});
