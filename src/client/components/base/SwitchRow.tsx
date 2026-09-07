import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Switch, type SwitchProps } from "./Switch";

export interface SwitchRowProps
  extends Pick<SwitchProps, "checked" | "disabled" | "onChange"> {
  /** Icon shown in the leading icon tile. */
  icon?: IconName;
  /** Optional leading icon node (e.g. a colored <Icon>) overriding `icon`. */
  iconNode?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
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
  description,
  checked,
  onChange,
  disabled,
  className = "",
}: SwitchRowProps) {
  return (
    <label className={`base-toggle-row ${disabled ? "base-toggle-row--disabled" : ""} ${className}`.trim()}>
      <div className="base-toggle-row__main">
        {(iconNode || icon) && (
          <div className="base-toggle-row__icon" aria-hidden="true">
            {iconNode ?? <Icon name={icon as IconName} size={15} />}
          </div>
        )}
        <div className="base-toggle-row__info">
          <span className="base-toggle-row__title">{title}</span>
          {description && <span className="base-toggle-row__desc">{description}</span>}
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
