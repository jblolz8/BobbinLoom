import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "ai"
  | "outline";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const SIZE_ICON_MAP: Record<ButtonSize, number> = {
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className = "",
    variant = "secondary",
    size = "md",
    iconOnly = false,
    fullWidth = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    disabled = false,
    type = "button",
    ...props
  },
  ref
) {
  const isActuallyDisabled = disabled || isLoading;
  const iconSize = SIZE_ICON_MAP[size];

  const classNames = [
    "base-btn",
    `base-btn--${variant}`,
    `base-btn--${size}`,
    iconOnly ? "base-btn--icon" : "",
    fullWidth ? "base-btn--full-width" : "",
    isLoading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classNames}
      disabled={isActuallyDisabled}
      aria-busy={isLoading ? "true" : undefined}
      aria-disabled={isActuallyDisabled ? "true" : undefined}
      {...props}
    >
      {isLoading ? (
        <span className="base-btn__spinner">
          <Icon name="Loader2" size={iconSize} />
        </span>
      ) : leftIcon ? (
        <span className="base-btn__icon base-btn__icon--left">{leftIcon}</span>
      ) : null}

      {children !== undefined && children !== null ? (
        <span className="base-btn__label">{children}</span>
      ) : null}

      {!isLoading && rightIcon ? (
        <span className="base-btn__icon base-btn__icon--right">{rightIcon}</span>
      ) : null}
    </button>
  );
});

export default Button;
