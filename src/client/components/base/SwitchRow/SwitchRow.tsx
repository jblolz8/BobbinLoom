import type { ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import { Icon, type IconName } from "../Icon/Icon";
import { Switch, type SwitchProps } from "../Switch/Switch";
import { TooltipIcon } from "../Tooltip/Tooltip";
import "./SwitchRow.css";

export interface SwitchRowProps extends Pick<
  SwitchProps,
  "checked" | "disabled" | "onChange"
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
 * A settings-style toggle row: leading icon tile, a title + optional
 * description, and a trailing Switch. Mirrors the "chat setting card" pattern
 * shared by the Settings modal's Chat tab and the Setup wizard, extracted so
 * all consumers use one theme-aware, accessible control.
 *
 * The whole row is a single <label>, so the title text serves as the hidden
 * checkbox's accessible name and clicking anywhere on the row toggles it —
 * no separate label is rendered beside the switch.
 */
export function SwitchRow({
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
}: SwitchRowProps) {
  return (
    <label
      className={`base-toggle-row ${dirty ? "base-toggle-row--dirty" : ""} ${disabled ? "base-toggle-row--disabled" : ""} ${className}`.trim()}
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
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        containerClassName="base-toggle-row__switch"
      />
    </label>
  );
}
