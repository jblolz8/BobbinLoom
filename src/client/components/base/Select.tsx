import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Icon } from "./Icon";

export const Select = RadixSelect.Root;
export const SelectGroup = RadixSelect.Group;
export const SelectValue = RadixSelect.Value;
export const SelectLabel = RadixSelect.Label;
export const SelectSeparator = RadixSelect.Separator;

export type SelectSize = "xs" | "sm" | "md" | "lg";
export type SelectVariant = "default" | "filled" | "ghost";

export interface SelectTriggerProps
  extends ComponentPropsWithoutRef<typeof RadixSelect.Trigger> {
  size?: SelectSize;
  variant?: SelectVariant;
  fullWidth?: boolean;
}

export const SelectTrigger = forwardRef<
  ElementRef<typeof RadixSelect.Trigger>,
  SelectTriggerProps
>(function SelectTrigger(
  {
    className = "",
    children,
    size = "md",
    variant = "default",
    fullWidth = true,
    ...props
  },
  ref
) {
  return (
    <RadixSelect.Trigger
      ref={ref}
      className={`base-select-trigger base-select-trigger--${size} base-select-trigger--${variant} ${fullWidth ? "base-select-trigger--full" : ""} ${className}`.trim()}
      {...props}
    >
      <span className="base-select-trigger__value">{children}</span>
      <RadixSelect.Icon asChild>
        <span className="base-select-trigger__icon" aria-hidden="true">
          <Icon name="ChevronDown" size={size === "xs" ? 12 : 14} />
        </span>
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
});

export interface SelectContentProps
  extends ComponentPropsWithoutRef<typeof RadixSelect.Content> {
  className?: string;
}

export const SelectContent = forwardRef<
  ElementRef<typeof RadixSelect.Content>,
  SelectContentProps
>(function SelectContent(
  { className = "", children, position = "popper", sideOffset = 5, ...props },
  ref
) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={`base-select-content ${className}`.trim()}
        {...props}
      >
        <RadixSelect.ScrollUpButton className="base-select-scroll-button">
          <Icon name="ChevronUp" size={13} />
        </RadixSelect.ScrollUpButton>
        <RadixSelect.Viewport className="base-select-viewport">
          {children}
        </RadixSelect.Viewport>
        <RadixSelect.ScrollDownButton className="base-select-scroll-button">
          <Icon name="ChevronDown" size={13} />
        </RadixSelect.ScrollDownButton>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
});

export interface SelectItemProps
  extends ComponentPropsWithoutRef<typeof RadixSelect.Item> {
  icon?: ReactNode;
  description?: string;
}

export const SelectItem = forwardRef<
  ElementRef<typeof RadixSelect.Item>,
  SelectItemProps
>(function SelectItem(
  { className = "", children, icon, description, ...props },
  ref
) {
  return (
    <RadixSelect.Item
      ref={ref}
      className={`base-select-item ${className}`.trim()}
      {...props}
    >
      <span className="base-select-item__content">
        {icon && <span className="base-select-item__icon">{icon}</span>}
        <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
        {description && <span className="base-select-item__desc">{description}</span>}
      </span>
      <RadixSelect.ItemIndicator className="base-select-item__indicator">
        <Icon name="Check" size={13} />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
});

export interface SimpleSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface SimpleSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<SimpleSelectOption<T>>;
  placeholder?: string;
  size?: SelectSize;
  variant?: SelectVariant;
  disabled?: boolean;
  className?: string;
  id?: string;
  fullWidth?: boolean;
  "aria-label"?: string;
}

export function SimpleSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  size = "md",
  variant = "default",
  disabled = false,
  className = "",
  id,
  fullWidth = false,
  "aria-label": ariaLabel,
}: SimpleSelectProps<T>) {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as T)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        className={className}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder}>
          {selectedOption ? (
            <span className="flex items-center gap-1.5 min-w-0">
              {selectedOption.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption.label}</span>
            </span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
            icon={opt.icon}
            description={opt.description}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default SimpleSelect;
