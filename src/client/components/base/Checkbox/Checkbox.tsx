import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import { TooltipIcon } from "../Tooltip/Tooltip";
import "./Checkbox.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label?: ReactNode;
  tooltip?: ReactNode;
  description?: ReactNode;
  dirty?: boolean;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      label,
      tooltip,
      description,
      dirty = false,
      containerClassName = "",
      className = "",
      id,
      disabled,
      ...inputProps
    },
    ref,
  ) {
    const inputId =
      id ||
      (typeof label === "string"
        ? `checkbox-${label.toLowerCase().replace(/\s+/g, "-")}`
        : undefined);

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
        {tooltip && <TooltipIcon content={tooltip} />}
        {dirty && (
          <Badge variant="warning" size="xs">
            Modified
          </Badge>
        )}
        {description && (
          <span className="checkbox-description">{description}</span>
        )}
      </label>
    );
  },
);
