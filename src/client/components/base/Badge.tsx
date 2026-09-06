import React from "react";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export type BadgeSize = "xs" | "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  pill?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      size = "sm",
      pill = false,
      leftIcon,
      rightIcon,
      children,
      className = "",
      title,
      ...props
    },
    ref
  ) => {
    const classNames = [
      "base-badge",
      `base-badge--${variant}`,
      `base-badge--${size}`,
      pill ? "base-badge--pill" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={classNames} title={title} {...props}>
        {leftIcon ? <span className="base-badge__icon base-badge__icon--left">{leftIcon}</span> : null}
        {children !== undefined && children !== null ? (
          <span className="base-badge__content">{children}</span>
        ) : null}
        {rightIcon ? <span className="base-badge__icon base-badge__icon--right">{rightIcon}</span> : null}
      </span>
    );
  }
);

Badge.displayName = "Badge";
