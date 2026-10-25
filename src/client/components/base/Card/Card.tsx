import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon } from "../Icon";

export type CardVariant = "elevated" | "panel" | "active";
export type CardPadding = "none" | "xs" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  active?: boolean;
  hoverable?: boolean;
  dirty?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
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
    dirty = false,
    dragging = false,
    dropTarget = false,
    className = "",
    children,
    ...props
  },
  ref,
) {
  const classNames = [
    "base-card",
    `base-card--${variant}`,
    `base-card--pad-${padding}`,
    active ? "base-card--active" : "",
    hoverable ? "base-card--hoverable" : "",
    dirty ? "base-card--dirty" : "",
    dragging ? "base-card--dragging" : "",
    dropTarget ? "base-card--drop-target" : "",
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

export interface DragHandleProps extends HTMLAttributes<HTMLSpanElement> {
  title?: string;
}

/** Pointer-based drag grip affordance for reorderable Card rows (supports mouse & touch). */
export function DragHandle({
  title = "Drag to reorder",
  className = "",
  ...props
}: DragHandleProps) {
  return (
    <span
      className={`base-drag-handle ${className}`.trim()}
      title={title}
      {...props}
    >
      <Icon name="GripVertical" size={14} />
    </span>
  );
}

export interface DragGhostProps {
  x: number;
  y: number;
  name: string;
}

/** Floating pointer label rendered while dragging a reorderable Card row. */
export function DragGhost({ x, y, name }: DragGhostProps) {
  return (
    <div className="base-drag-ghost" style={{ left: x, top: y }}>
      <span className="base-drag-ghost__name">{name}</span>
    </div>
  );
}

export default Card;
