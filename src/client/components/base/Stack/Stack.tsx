import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export type StackDirection = "row" | "column";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between";
export type StackGap = "none" | "2xs" | "xs" | "sm" | "md" | "lg";

export interface StackProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  direction?: StackDirection;
  align?: StackAlign;
  justify?: StackJustify;
  gap?: StackGap;
  wrap?: boolean;
  inline?: boolean;
  flex1?: boolean;
  fullHeight?: boolean;
  sticky?: boolean;
  /** Hides the stack on wide desktop viewports (>= 1101px) where multi-pane layouts are already visible. */
  mobileOnly?: boolean;
  children?: ReactNode;
}

export const Stack = forwardRef<HTMLElement, StackProps>(function Stack(
  {
    as: Component = "div",
    direction = "row",
    align = "center",
    justify,
    gap = "sm",
    wrap = false,
    inline = false,
    flex1 = false,
    fullHeight = false,
    sticky = false,
    mobileOnly = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  const classNames = [
    "base-stack",
    inline ? "base-stack--inline" : "",
    `base-stack--${direction}`,
    `base-stack--align-${align}`,
    justify ? `base-stack--justify-${justify}` : "",
    `base-stack--gap-${gap}`,
    wrap ? "base-stack--wrap" : "",
    flex1 ? "base-stack--flex-1" : "",
    fullHeight ? "base-stack--full-height" : "",
    sticky ? "base-stack--sticky" : "",
    mobileOnly ? "base-stack--mobile-only" : "",
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

export default Stack;
