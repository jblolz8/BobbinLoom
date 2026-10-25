import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Badge } from "./Badge/Badge";
import { Icon, type IconName } from "./Icon";
import { TooltipIcon } from "./Tooltip/Tooltip";

export interface CheckboxRowProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "title"
> {
  /** Icon shown in the leading icon tile. */
  icon?: IconName;
  /** Optional leading icon node (e.g. a colored <Icon>) overriding `icon`. */
  iconNode?: ReactNode;
  title: ReactNode;
  /** Optional info tooltip trigger icon rendered beside the title. */
  tooltip?: ReactNode;
  description?: ReactNode;
  dirty?: boolean;
  className?: string;
}

/**
 * A settings/form-style checkbox card row: leading icon tile, a title + optional
 * description, and a trailing theme-aware checkbox indicator.
 *
 * Shares the `.base-toggle-row` surface with `SwitchRow`, but uses a checkmark
 * box suited for deferred-save forms (e.g. Setup wizard, Preset editor, Connection
 * editor) and multi-item checklists.
 */
export const CheckboxRow = forwardRef<HTMLInputElement, CheckboxRowProps>(
  function CheckboxRow(
    {
      icon,
      iconNode,
      title,
      tooltip,
      description,
      dirty = false,
      checked,
      onChange,
      disabled,
      className = "",
      ...inputProps
    },
    ref,
  ) {
    return (
      <label
        className={`base-toggle-row base-toggle-row--checkbox ${dirty ? "base-toggle-row--dirty" : ""} ${disabled ? "base-toggle-row--disabled" : ""} ${className}`.trim()}
      >
        <div className="base-toggle-row__main">
          {(iconNode || icon) && (
            <div className="base-toggle-row__icon" aria-hidden="true">
              {iconNode ?? <Icon name={icon as IconName} size={15} />}
            </div>
          )}
          <div className="base-toggle-row__info">
            <span className="base-toggle-row__title">
              <span>{title}</span>
              {tooltip && <TooltipIcon content={tooltip} />}
              {dirty && (
                <Badge variant="warning" size="xs">
                  Modified
                </Badge>
              )}
            </span>
            {description && (
              <span className="base-toggle-row__desc">{description}</span>
            )}
          </div>
        </div>
        <span className="base-toggle-row__checkbox">
          <input
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="base-toggle-row__checkbox-input"
            {...inputProps}
          />
          <span className="base-toggle-row__checkbox-box" aria-hidden="true">
            <Icon name="Check" size={12} strokeWidth={3} />
          </span>
        </span>
      </label>
    );
  },
);
