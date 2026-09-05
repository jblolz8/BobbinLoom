import { forwardRef, type ReactNode } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import type {
  DropdownMenuContentProps as RadixContentProps,
  DropdownMenuItemProps as RadixItemProps,
  DropdownMenuLabelProps as RadixLabelProps,
  DropdownMenuSeparatorProps as RadixSeparatorProps,
} from "@radix-ui/react-dropdown-menu";

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;
export const DropdownMenuGroup = RadixDropdownMenu.Group;
export const DropdownMenuPortal = RadixDropdownMenu.Portal;

export interface DropdownMenuContentProps extends RadixContentProps {
  className?: string;
}

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  { className = "", sideOffset = 6, children, ...props },
  ref
) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={`base-dropdown-content ${className}`.trim()}
        {...props}
      >
        {children}
      </RadixDropdownMenu.Content>
    </RadixDropdownMenu.Portal>
  );
});

export interface DropdownMenuItemProps extends RadixItemProps {
  icon?: ReactNode;
  danger?: boolean;
}

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { children, icon, danger = false, className = "", ...props },
  ref
) {
  return (
    <RadixDropdownMenu.Item
      ref={ref}
      className={`base-dropdown-item ${danger ? "danger" : ""} ${className}`.trim()}
      data-variant={danger ? "danger" : undefined}
      {...props}
    >
      {icon ? <span className="inline-flex items-center shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </RadixDropdownMenu.Item>
  );
});

export function DropdownMenuSeparator({
  className = "",
  ...props
}: RadixSeparatorProps) {
  return (
    <RadixDropdownMenu.Separator
      className={`base-dropdown-separator ${className}`.trim()}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className = "",
  ...props
}: RadixLabelProps) {
  return (
    <RadixDropdownMenu.Label
      className={`base-dropdown-label ${className}`.trim()}
      {...props}
    />
  );
}
