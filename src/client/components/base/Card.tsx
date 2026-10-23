import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export type CardVariant = "elevated" | "panel" | "active";
export type CardPadding = "none" | "xs" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  hoverable?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as: Component = "div",
    variant = "elevated",
    padding = "md",
    hoverable = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  const classNames = [
    "base-card",
    `base-card--${variant}`,
    `base-card--pad-${padding}`,
    hoverable ? "base-card--hoverable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component ref={ref} className={classNames} {...props}>
      {children}
    </Component>
  );
});

export default Card;
