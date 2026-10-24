import { isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Icon, type IconName } from "../Icon";

export type TooltipCollapseBreakpoint = "xs" | "sm" | "md" | "always";

const COLLAPSE_MEDIA_QUERY: Record<Exclude<TooltipCollapseBreakpoint, "always">, string> = {
  xs: "(max-width: 360px)",
  sm: "(max-width: 540px)",
  md: "(max-width: 768px)",
};

function matchesCollapseBreakpoint(breakpoint: TooltipCollapseBreakpoint | undefined): boolean {
  if (!breakpoint) return true;
  if (breakpoint === "always") return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COLLAPSE_MEDIA_QUERY[breakpoint]).matches;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number | Partial<Record<"top" | "right" | "bottom" | "left", number>>;
  disabled?: boolean;
  /**
   * Breakpoint below which the trigger collapses to an icon-only control.
   * Automatically inferred when wrapping a `<Button collapseBelow="...">`.
   */
  collapseBelow?: TooltipCollapseBreakpoint;
  /**
   * When true (default when `collapseBelow` is present on Tooltip or its child Button),
   * the tooltip is suppressed while the button's text label is visible and only activates
   * when the button is in its collapsed/icon-only state.
   */
  onlyWhenCollapsed?: boolean;
  className?: string;
  asChild?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
}

interface CollapsibleChildProps {
  collapseBelow?: TooltipCollapseBreakpoint;
  iconOnly?: boolean;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  collisionPadding = 10,
  disabled = false,
  collapseBelow,
  onlyWhenCollapsed,
  className = "",
  asChild = true,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
}: TooltipProps) {
  const childProps: CollapsibleChildProps | undefined = isValidElement(children)
    ? ((children as ReactElement<CollapsibleChildProps>).props ?? undefined)
    : undefined;

  const effectiveCollapseBelow = collapseBelow ?? childProps?.collapseBelow;
  const shouldGateByCollapse =
    onlyWhenCollapsed ?? (effectiveCollapseBelow !== undefined && !childProps?.iconOnly);

  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState<boolean>(() =>
    matchesCollapseBreakpoint(effectiveCollapseBelow)
  );

  useEffect(() => {
    if (!effectiveCollapseBelow || effectiveCollapseBelow === "always") {
      setIsBelowBreakpoint(true);
      return;
    }
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsBelowBreakpoint(false);
      return;
    }
    const mq = window.matchMedia(COLLAPSE_MEDIA_QUERY[effectiveCollapseBelow]);
    setIsBelowBreakpoint(mq.matches);
    const handleChange = (e: MediaQueryListEvent) => {
      setIsBelowBreakpoint(e.matches);
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [effectiveCollapseBelow]);

  const isEffectivelyDisabled =
    !content || disabled || (shouldGateByCollapse && !isBelowBreakpoint);

  if (isEffectivelyDisabled) {
    return <>{children}</>;
  }

  // If asChild is requested but children isn't a single valid React element, wrap it in a span
  const shouldUseAsChild = asChild && isValidElement(children);

  return (
    <RadixTooltip.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
    >
      <RadixTooltip.Trigger asChild={shouldUseAsChild}>
        {shouldUseAsChild ? children : <span>{children}</span>}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          data-collapse-below={shouldGateByCollapse ? effectiveCollapseBelow : undefined}
          className={`base-tooltip-content ${className}`.trim()}
        >
          {content}
          <RadixTooltip.Arrow className="base-tooltip-arrow" width={8} height={4} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export interface TooltipIconProps {
  content: ReactNode;
  icon?: IconName;
  size?: number;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  ariaLabel?: string;
  className?: string;
}

export function TooltipIcon({
  content,
  icon = "HelpCircle",
  size = 13,
  side = "top",
  align = "center",
  ariaLabel = "More information",
  className = "",
}: TooltipIconProps) {
  if (!content) return null;
  return (
    <Tooltip content={content} side={side} align={align} delayDuration={150}>
      <span
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        className={`base-tooltip-icon ${className}`.trim()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Icon name={icon} size={size} />
      </span>
    </Tooltip>
  );
}

export default Tooltip;
