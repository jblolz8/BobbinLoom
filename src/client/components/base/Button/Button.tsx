import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon/Icon";
import { Tooltip, type TooltipProps } from "../Tooltip/Tooltip";
import "./Button.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "ai"
  | "outline"
  /** Floats over media the app does not control — paints its own scrim. */
  | "overlay";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

/** Viewport threshold below which the button hides its text label and becomes an icon button. */
export type ButtonCollapseBreakpoint = "xs" | "sm" | "md" | "always";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  /** Round instead of the default rounded square (media/overlay controls). */
  round?: boolean;
  fullWidth?: boolean;
  isLoading?: boolean;
  /** Highlights the button as toggled/active using theme surface tokens. */
  active?: boolean;
  /** Hides the button label below the specified viewport breakpoint (requires leftIcon or rightIcon). */
  collapseBelow?: ButtonCollapseBreakpoint;
  /** Optional tooltip content. When paired with `collapseBelow`, only shows in the icon-only state by default. */
  tooltip?: ReactNode;
  /** Placement side for `tooltip` (defaults to `"top"`). */
  tooltipSide?: TooltipProps["side"];
  leftIcon?: IconName | ReactNode;
  rightIcon?: IconName | ReactNode;
}

const SIZE_ICON_MAP: Record<ButtonSize, number> = {
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
};

function renderButtonIcon(
  icon: IconName | ReactNode | undefined,
  size: number,
): ReactNode {
  if (!icon) return null;
  if (typeof icon === "string") {
    return <Icon name={icon} size={size} />;
  }
  return icon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className = "",
      variant = "secondary",
      size = "md",
      iconOnly = false,
      round = false,
      fullWidth = false,
      isLoading = false,
      active = false,
      collapseBelow,
      tooltip,
      tooltipSide = "top",
      leftIcon,
      rightIcon,
      disabled = false,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isActuallyDisabled = disabled || isLoading;
    const iconSize = SIZE_ICON_MAP[size];
    const resolvedAriaLabel =
      props["aria-label"] ??
      (collapseBelow || iconOnly
        ? typeof tooltip === "string"
          ? tooltip
          : typeof children === "string"
            ? children
            : undefined
        : undefined);

    const classNames = [
      "base-btn",
      `base-btn--${variant}`,
      `base-btn--${size}`,
      iconOnly ? "base-btn--icon" : "",
      round ? "base-btn--round" : "",
      fullWidth ? "base-btn--full-width" : "",
      active ? "base-btn--active" : "",
      collapseBelow ? `base-btn--collapse-${collapseBelow}` : "",
      isLoading ? "is-loading" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const buttonElement = (
      <button
        ref={ref}
        type={type}
        className={classNames}
        disabled={isActuallyDisabled}
        aria-busy={isLoading ? "true" : undefined}
        aria-disabled={isActuallyDisabled ? "true" : undefined}
        aria-label={resolvedAriaLabel}
        {...props}
      >
        {isLoading ? (
          <span className="base-btn__spinner">
            <Icon name="Loader2" size={iconSize} />
          </span>
        ) : leftIcon ? (
          <span className="base-btn__icon base-btn__icon--left">
            {renderButtonIcon(leftIcon, iconSize)}
          </span>
        ) : null}

        {children !== undefined && children !== null ? (
          <span className="base-btn__label">{children}</span>
        ) : null}

        {!isLoading && rightIcon ? (
          <span className="base-btn__icon base-btn__icon--right">
            {renderButtonIcon(rightIcon, iconSize)}
          </span>
        ) : null}
      </button>
    );

    if (tooltip) {
      return (
        <Tooltip
          content={tooltip}
          side={tooltipSide}
          collapseBelow={collapseBelow}
        >
          {buttonElement}
        </Tooltip>
      );
    }

    return buttonElement;
  },
);

export default Button;
