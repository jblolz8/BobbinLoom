import {
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Icon, type IconName } from "../Icon/Icon";
import "./Tooltip.css";

export type TooltipCollapseBreakpoint = "xs" | "sm" | "md" | "always";

const COLLAPSE_MEDIA_QUERY: Record<
  Exclude<TooltipCollapseBreakpoint, "always">,
  string
> = {
  xs: "(max-width: 360px)",
  sm: "(max-width: 540px)",
  md: "(max-width: 768px)",
};

function matchesCollapseBreakpoint(
  breakpoint: TooltipCollapseBreakpoint | undefined,
): boolean {
  if (!breakpoint) return true;
  if (breakpoint === "always") return true;
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
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
  collisionPadding?:
    | number
    | Partial<Record<"top" | "right" | "bottom" | "left", number>>;
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
  /** When true, enables pointer events inside the tooltip so users can hover into, scroll, and click interactive elements inside it. */
  interactive?: boolean;
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
  interactive = false,
}: TooltipProps) {
  const childProps: CollapsibleChildProps | undefined = isValidElement(children)
    ? ((children as ReactElement<CollapsibleChildProps>).props ?? undefined)
    : undefined;

  const effectiveCollapseBelow = collapseBelow ?? childProps?.collapseBelow;
  const shouldGateByCollapse =
    onlyWhenCollapsed ??
    (effectiveCollapseBelow !== undefined && !childProps?.iconOnly);

  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState<boolean>(() =>
    matchesCollapseBreakpoint(effectiveCollapseBelow),
  );

  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(
    defaultOpen ?? false,
  );
  const isControlled = open !== undefined;
  const interactiveOpen = isControlled ? open : uncontrolledOpen;
  const interactiveOpenRef = useRef<boolean>(interactiveOpen);
  interactiveOpenRef.current = interactiveOpen;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const setInteractiveOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const prev = interactiveOpenRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (resolved === prev) return;
      interactiveOpenRef.current = resolved;
      if (!isControlled) {
        setUncontrolledOpen(resolved);
      }
      onOpenChange?.(resolved);
    },
    [isControlled, onOpenChange],
  );

  const scheduleInteractiveOpen = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (interactiveOpenRef.current || openTimerRef.current !== null) return;
    const delay = delayDuration ?? 120;
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      setInteractiveOpen(true);
    }, delay);
  }, [delayDuration, setInteractiveOpen]);

  const scheduleInteractiveClose = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setInteractiveOpen(false);
    }, 150);
  }, [setInteractiveOpen]);

  // When an interactive tooltip is open, close it if an ancestor scroll container of the trigger scrolls
  // (while ignoring scroll events inside the tooltip portal content itself).
  useEffect(() => {
    if (!interactive || !interactiveOpen || typeof window === "undefined") {
      return;
    }
    const handleScroll = (event: Event) => {
      const triggerEl = triggerRef.current;
      if (
        triggerEl &&
        event.target instanceof Node &&
        event.target.contains(triggerEl)
      ) {
        clearTimers();
        setInteractiveOpen(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { capture: true });
    return () =>
      window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [interactive, interactiveOpen, clearTimers, setInteractiveOpen]);

  useEffect(() => {
    if (!effectiveCollapseBelow || effectiveCollapseBelow === "always") {
      setIsBelowBreakpoint(true);
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
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
      open={interactive ? interactiveOpen : open}
      defaultOpen={interactive ? undefined : defaultOpen}
      onOpenChange={interactive ? undefined : onOpenChange}
      delayDuration={delayDuration}
      disableHoverableContent={!interactive}
    >
      <RadixTooltip.Trigger
        ref={interactive ? triggerRef : undefined}
        asChild={shouldUseAsChild}
        onPointerEnter={
          interactive
            ? (e) => {
                if (e.pointerType === "touch") return;
                scheduleInteractiveOpen();
              }
            : undefined
        }
        onPointerLeave={
          interactive
            ? (e) => {
                if (e.pointerType === "touch") return;
                scheduleInteractiveClose();
              }
            : undefined
        }
        onClick={
          interactive
            ? (e) => {
                e.stopPropagation();
                clearTimers();
                setInteractiveOpen((prev) => !prev);
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  clearTimers();
                  setInteractiveOpen((prev) => !prev);
                } else if (e.key === "Escape" && interactiveOpenRef.current) {
                  e.stopPropagation();
                  clearTimers();
                  setInteractiveOpen(false);
                }
              }
            : undefined
        }
      >
        {shouldUseAsChild ? children : <span>{children}</span>}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          data-collapse-below={
            shouldGateByCollapse ? effectiveCollapseBelow : undefined
          }
          className={`base-tooltip-content ${interactive ? "base-tooltip-content--interactive" : ""} ${className}`.trim()}
          onPointerEnter={
            interactive
              ? (e) => {
                  if (e.pointerType === "touch") return;
                  if (closeTimerRef.current !== null) {
                    clearTimeout(closeTimerRef.current);
                    closeTimerRef.current = null;
                  }
                }
              : undefined
          }
          onPointerLeave={
            interactive
              ? (e) => {
                  if (e.pointerType === "touch") return;
                  scheduleInteractiveClose();
                }
              : undefined
          }
          onEscapeKeyDown={
            interactive
              ? () => {
                  clearTimers();
                  setInteractiveOpen(false);
                }
              : undefined
          }
          onPointerDownOutside={
            interactive
              ? (event) => {
                  const target = event.detail?.originalEvent?.target ?? event.target;
                  if (
                    triggerRef.current &&
                    target instanceof Node &&
                    triggerRef.current.contains(target)
                  ) {
                    return;
                  }
                  clearTimers();
                  setInteractiveOpen(false);
                }
              : undefined
          }
        >
          {content}
          <RadixTooltip.Arrow
            className="base-tooltip-arrow"
            width={8}
            height={4}
          />
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
