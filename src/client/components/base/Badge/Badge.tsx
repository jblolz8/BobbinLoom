import React from "react";
import { Icon, type IconName } from "../Icon";
import "./Badge.css";

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
  /** Truncate overflowing text with an ellipsis inside flex/grid layouts. */
  truncate?: boolean;
  /** Maximum inline width before text truncates (e.g. `240` or `"240px"`). */
  maxWidth?: number | string;
  leftIcon?: IconName | React.ReactNode;
  rightIcon?: IconName | React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

const SIZE_ICON_MAP: Record<BadgeSize, number> = {
  xs: 12,
  sm: 14,
  md: 15,
};

function renderBadgeIcon(
  icon: IconName | React.ReactNode | undefined,
  size: number
): React.ReactNode {
  if (!icon) return null;
  if (typeof icon === "string") {
    return <Icon name={icon} size={size} />;
  }
  return icon;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      size = "sm",
      pill = false,
      truncate = false,
      maxWidth,
      leftIcon,
      rightIcon,
      children,
      className = "",
      title,
      style,
      ...props
    },
    ref
  ) => {
    const iconSize = SIZE_ICON_MAP[size];
    const classNames = [
      "base-badge",
      `base-badge--${variant}`,
      `base-badge--${size}`,
      pill ? "base-badge--pill" : "",
      truncate ? "base-badge--truncate" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const mergedStyle = maxWidth !== undefined ? { maxWidth, ...style } : style;

    return (
      <span ref={ref} className={classNames} title={title} style={mergedStyle} {...props}>
        {leftIcon ? (
          <span className="base-badge__icon base-badge__icon--left">
            {renderBadgeIcon(leftIcon, iconSize)}
          </span>
        ) : null}
        {children !== undefined && children !== null ? (
          <span className="base-badge__content">{children}</span>
        ) : null}
        {rightIcon ? (
          <span className="base-badge__icon base-badge__icon--right">
            {renderBadgeIcon(rightIcon, iconSize)}
          </span>
        ) : null}
      </span>
    );
  }
);

Badge.displayName = "Badge";
