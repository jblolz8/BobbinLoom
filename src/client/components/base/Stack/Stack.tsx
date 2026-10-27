import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import "./Stack.css";

export type StackDirection = "row" | "column";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between";
export type StackGap = "none" | "2xs" | "xs" | "sm" | "md" | "lg";
export type StackCollapseBreakpoint = "sm" | "md";
export type StackScrollableSize = boolean | "sm" | "md" | "lg";

export interface StackProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  direction?: StackDirection;
  align?: StackAlign;
  justify?: StackJustify;
  gap?: StackGap;
  wrap?: boolean;
  inline?: boolean;
  flex1?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  /** Pushes the stack to the bottom of a flex column (`margin-top: auto`). */
  pushBottom?: boolean;
  sticky?: boolean;
  dimmed?: boolean;
  scrollable?: StackScrollableSize;
  /** Collapses a row Stack into a vertical column below the specified viewport breakpoint (`sm` = 680px, `md` = 820px). */
  stackBelow?: StackCollapseBreakpoint;
  /** Hides the stack below the specified viewport breakpoint (`sm` = 680px, `md` = 820px). */
  hideBelow?: StackCollapseBreakpoint;
  /** Shows the stack only below the specified viewport breakpoint (`sm` = 680px, `md` = 820px). */
  showBelow?: StackCollapseBreakpoint;
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
    fullWidth = false,
    fullHeight = false,
    pushBottom = false,
    sticky = false,
    dimmed = false,
    scrollable = false,
    stackBelow,
    hideBelow,
    showBelow,
    mobileOnly = false,
    className = "",
    children,
    ...props
  },
  ref,
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
    fullWidth ? "base-stack--full-width" : "",
    fullHeight ? "base-stack--full-height" : "",
    pushBottom ? "base-stack--push-bottom" : "",
    sticky ? "base-stack--sticky" : "",
    dimmed ? "base-stack--dimmed" : "",
    scrollable ? "base-stack--scrollable" : "",
    typeof scrollable === "string" ? `base-stack--scrollable-${scrollable}` : "",
    stackBelow ? `base-stack--stack-below-${stackBelow}` : "",
    hideBelow ? `base-stack--hide-below-${hideBelow}` : "",
    showBelow ? `base-stack--show-below-${showBelow}` : "",
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
