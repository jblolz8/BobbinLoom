import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon } from "../Icon";

export type CardVariant = "elevated" | "panel" | "active";
export type CardPadding = "none" | "xs" | "sm" | "md" | "lg";
export type CardLayout = "column" | "row";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  layout?: CardLayout;
  active?: boolean;
  hoverable?: boolean;
  dirty?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children?: ReactNode;
}

const CardBase = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as: Component = "div",
    variant = "elevated",
    padding = "md",
    layout,
    active = false,
    hoverable = false,
    dirty = false,
    dragging = false,
    dropTarget = false,
    fullWidth = false,
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
    layout ? `base-card--layout-${layout}` : "",
    active ? "base-card--active" : "",
    hoverable ? "base-card--hoverable" : "",
    dirty ? "base-card--dirty" : "",
    dragging ? "base-card--dragging" : "",
    dropTarget ? "base-card--drop-target" : "",
    fullWidth ? "base-card--full-width" : "",
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

export interface CardCoverProps extends HTMLAttributes<HTMLDivElement> {
  position?: "top" | "row";
  children?: ReactNode;
}

/** Media cover slot for vertical cards (`position="top"`) or horizontal list rows (`position="row"`). */
export function CardCover({
  position = "top",
  className = "",
  children,
  ...props
}: CardCoverProps) {
  const classNames = [
    "base-card__cover",
    `base-card__cover--${position}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

/**
 * Primary navigation button inside a Card whose `::after` pseudo-element stretches
 * the clickable area across the entire Card while keeping sibling `Card.Interactive`
 * controls (menus, tag strips) independently clickable above it.
 */
export const CardTitleButton = forwardRef<
  HTMLButtonElement,
  CardTitleButtonProps
>(function CardTitleButton({ className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`base-card__title-btn ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
});

export interface CardInteractiveProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Elevated z-index container for action menus, badges, or buttons inside a Card with a `Card.TitleButton`. */
export function CardInteractive({
  className = "",
  children,
  ...props
}: CardInteractiveProps) {
  return (
    <div className={`base-card__interactive ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export type CardCompound = typeof CardBase & {
  Cover: typeof CardCover;
  TitleButton: typeof CardTitleButton;
  Interactive: typeof CardInteractive;
};

export const Card = Object.assign(CardBase, {
  Cover: CardCover,
  TitleButton: CardTitleButton,
  Interactive: CardInteractive,
}) as CardCompound;

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
