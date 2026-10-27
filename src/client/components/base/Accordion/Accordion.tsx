import {
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../Icon/Icon";
import { TooltipIcon } from "../Tooltip/Tooltip";
import "./Accordion.css";

export type AccordionVariant = "default" | "elevated" | "panel";

export interface AccordionProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled (defaults to `false`). */
  defaultOpen?: boolean;
  /** Called when the user toggles the accordion header. */
  onOpenChange?: (open: boolean) => void;
  /** Leading icon name or custom node in the header. */
  icon?: IconName | ReactNode;
  /** Header title. */
  title: ReactNode;
  /** Optional tooltip icon next to the title. */
  tooltip?: ReactNode;
  /** Optional helper description shown below the header row. */
  description?: ReactNode;
  /** Optional badge rendered inline next to the title. */
  badge?: ReactNode;
  /** Optional interactive action(s) on the right side of the header (does not toggle the accordion). */
  action?: ReactNode;
  /** Optional summary content shown even when the accordion is collapsed (e.g. selected chips). */
  summary?: ReactNode;
  /** Visual surface style. */
  variant?: AccordionVariant;
  children?: ReactNode;
}

function renderAccordionIcon(icon: IconName | ReactNode | undefined): ReactNode {
  if (!icon) return null;
  if (typeof icon === "string") {
    return <Icon name={icon} size={14} />;
  }
  return icon;
}

export function Accordion({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  icon,
  title,
  tooltip,
  description,
  badge,
  action,
  summary,
  variant = "default",
  className = "",
  children,
  ...props
}: AccordionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const panelId = useId();
  const triggerId = useId();

  function handleToggle() {
    const next = !isOpen;
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }

  const rootClassName = [
    "base-accordion",
    `base-accordion--${variant}`,
    isOpen ? "base-accordion--open" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} {...props}>
      <div className="base-accordion__header">
        <div className="base-accordion__header-row">
          <button
            type="button"
            id={triggerId}
            className="base-accordion__trigger"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={handleToggle}
          >
            <span className="base-accordion__title-group">
              {icon ? (
                <span className="base-accordion__icon">
                  {renderAccordionIcon(icon)}
                </span>
              ) : null}
              <span className="base-accordion__title">{title}</span>
              {tooltip ? <TooltipIcon content={tooltip} /> : null}
              {badge ? (
                <span className="base-accordion__badge">{badge}</span>
              ) : null}
            </span>
            <Icon
              name="ChevronDown"
              size={15}
              className="base-accordion__chevron"
            />
          </button>

          {action ? (
            <div
              className="base-accordion__action"
              onClick={(e) => e.stopPropagation()}
            >
              {action}
            </div>
          ) : null}
        </div>

        {description ? (
          <p className="base-accordion__description field-helper-text">
            {description}
          </p>
        ) : null}

        {summary ? (
          <div className="base-accordion__summary">{summary}</div>
        ) : null}
      </div>

      {isOpen ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          className="base-accordion__body"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default Accordion;
