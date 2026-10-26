import { forwardRef, useState, type ReactNode } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import type {
  DropdownMenuContentProps as RadixContentProps,
  DropdownMenuItemProps as RadixItemProps,
  DropdownMenuLabelProps as RadixLabelProps,
  DropdownMenuSeparatorProps as RadixSeparatorProps,
} from "@radix-ui/react-dropdown-menu";
import { Button } from "../Button/Button";
import { Icon, type IconName } from "../Icon/Icon";
import { Tooltip } from "../Tooltip/Tooltip";
import "./DropdownMenu.css";

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
  { className = "", sideOffset = 6, onCloseAutoFocus, children, ...props },
  ref,
) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={`base-dropdown-content ${className}`.trim()}
        onCloseAutoFocus={(e) => {
          // Prevent Radix from returning focus to the trigger button on close,
          // which would otherwise trigger a wrapping Tooltip's focus handler and leave the tooltip stuck open.
          e.preventDefault();
          onCloseAutoFocus?.(e);
        }}
        {...props}
      >
        {children}
      </RadixDropdownMenu.Content>
    </RadixDropdownMenu.Portal>
  );
});

export interface DropdownMenuItemProps extends RadixItemProps {
  icon?: IconName | ReactNode;
  iconClassName?: string;
  danger?: boolean;
}

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { children, icon, iconClassName, danger = false, className = "", ...props },
  ref,
) {
  const renderedIcon =
    icon !== undefined && icon !== null ? (
      typeof icon === "string" ? (
        <Icon name={icon} size={14} className={iconClassName} />
      ) : (
        icon
      )
    ) : null;

  return (
    <RadixDropdownMenu.Item
      ref={ref}
      className={`base-dropdown-item ${danger ? "danger" : ""} ${className}`.trim()}
      data-variant={danger ? "danger" : undefined}
      {...props}
    >
      {renderedIcon ? (
        <span className="base-dropdown-item__icon">{renderedIcon}</span>
      ) : null}
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

export interface ActionsMenuItem {
  id?: string;
  label: ReactNode;
  icon?: IconName | ReactNode;
  iconClassName?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Renders a separator before this item. Defaults to true when `danger` is true and the item is not first. */
  separatorBefore?: boolean;
}

export interface ActionsMenuProps {
  items: Array<ActionsMenuItem | null | undefined | false>;
  /** Tooltip and aria-label for the trigger button. Default: "More options". */
  label?: string;
  /** Trigger icon name. Default: "MoreVertical". */
  triggerIcon?: IconName;
  /** Trigger button variant. Default: "ghost". */
  triggerVariant?: "ghost" | "secondary";
  /** Trigger button size. Default: "sm". */
  triggerSize?: "xs" | "sm" | "md";
  /** Menu alignment relative to trigger. Default: "end". */
  align?: "start" | "center" | "end";
  /** Disables the trigger button. */
  disabled?: boolean;
  className?: string;
}

/**
 * Reusable card/row actions dropdown menu with a synchronized Tooltip trigger.
 * Automatically suppresses the tooltip while the menu is open or closing, and
 * stops click/pointer/keyboard events from bubbling up to clickable parent cards.
 */
export function ActionsMenu({
  items,
  label = "More options",
  triggerIcon = "MoreVertical",
  triggerVariant = "ghost",
  triggerSize = "sm",
  align = "end",
  disabled = false,
  className = "",
}: ActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const validItems = items.filter((item): item is ActionsMenuItem =>
    Boolean(item),
  );
  if (validItems.length === 0) return null;

  return (
    <div
      className={`base-actions-menu ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (next) {
            setTooltipOpen(false);
          }
        }}
      >
        <Tooltip
          content={label}
          open={menuOpen ? false : tooltipOpen}
          onOpenChange={(next) => {
            if (!menuOpen) {
              setTooltipOpen(next);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant={triggerVariant}
              size={triggerSize}
              iconOnly
              disabled={disabled}
              aria-label={label}
            >
              <Icon name={triggerIcon} size={16} />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          align={align}
          onCloseAutoFocus={() => {
            setTooltipOpen(false);
          }}
        >
          {validItems.map((item, idx) => {
            const showSeparator =
              item.separatorBefore ?? (Boolean(item.danger) && idx > 0);
            const key =
              item.id ??
              (typeof item.label === "string" ? item.label : `item-${idx}`);
            return (
              <div key={key} className="base-actions-menu__entry">
                {showSeparator ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  icon={item.icon}
                  iconClassName={item.iconClassName}
                  danger={item.danger}
                  disabled={item.disabled}
                  onClick={() => {
                    setTooltipOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
