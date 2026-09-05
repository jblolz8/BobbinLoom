import { isValidElement, type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number | Partial<Record<"top" | "right" | "bottom" | "left", number>>;
  disabled?: boolean;
  className?: string;
  asChild?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  collisionPadding = 10,
  disabled = false,
  className = "",
  asChild = true,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration,
}: TooltipProps) {
  if (!content || disabled) {
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
          className={`base-tooltip-content ${className}`.trim()}
        >
          {content}
          <RadixTooltip.Arrow className="base-tooltip-arrow" width={8} height={4} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export default Tooltip;
