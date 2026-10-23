import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import "./Card.css";

export type CardVariant = "elevated" | "panel" | "active";
export type CardPadding = "none" | "xs" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  active?: boolean;
  hoverable?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as: Component = "div",
    variant = "elevated",
    padding = "md",
    active = false,
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
    active ? "base-card--active" : "",
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
