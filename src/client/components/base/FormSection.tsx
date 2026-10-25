import { type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import { TooltipIcon } from "./Tooltip/Tooltip";

export interface SectionHeaderProps {
  icon?: string;
  title: ReactNode;
  tooltip?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  icon,
  title,
  tooltip,
  description,
  badge,
  action,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`base-section-header ${className}`.trim()}>
      <div className="base-section-header__row">
        <h5 className="base-form-section-title">
          {icon && <Icon name={icon} size={13} />}
          <span>{title}</span>
          {tooltip && <TooltipIcon content={tooltip} />}
          {badge}
        </h5>
        {action && <div className="base-section-header__action">{action}</div>}
      </div>
      {description && <p className="field-helper-text">{description}</p>}
    </div>
  );
}

export interface FormSectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> {
  icon?: string;
  title: ReactNode;
  tooltip?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}

export function FormSection({
  icon,
  title,
  tooltip,
  description,
  badge,
  action,
  collapsible = false,
  defaultOpen = false,
  className = "",
  children,
  ...props
}: FormSectionProps) {
  if (collapsible) {
    return (
      <details
        className={`base-form-section base-form-section--collapsible ${className}`.trim()}
        open={defaultOpen || undefined}
      >
        <summary className="base-form-section__summary">
          <span className="base-form-section-title">
            {icon && <Icon name={icon} size={13} />}
            <span>{title}</span>
            {tooltip && <TooltipIcon content={tooltip} />}
            {badge}
          </span>
          <Icon
            name="ChevronDown"
            size={13}
            className="base-form-section__chevron"
          />
        </summary>
        <div className="base-form-section__body base-form-section__body--collapsible">
          {description && <p className="field-helper-text">{description}</p>}
          {children}
        </div>
      </details>
    );
  }

  return (
    <section className={`base-form-section ${className}`.trim()} {...props}>
      <SectionHeader
        icon={icon}
        title={title}
        tooltip={tooltip}
        description={description}
        badge={badge}
        action={action}
      />
      <div className="base-form-section__body">{children}</div>
    </section>
  );
}

export default FormSection;
