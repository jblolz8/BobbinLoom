import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Badge } from "../Badge/Badge";
import { Icon } from "../Icon/Icon";
import { TooltipIcon } from "../Tooltip/Tooltip";
import "../TextInput/TextInput.css";
import "./Select.css";

export const Select = RadixSelect.Root;
export const SelectGroup = RadixSelect.Group;
export const SelectValue = RadixSelect.Value;
export const SelectLabel = RadixSelect.Label;
export const SelectSeparator = RadixSelect.Separator;

export type SelectSize = "xs" | "sm" | "md" | "lg";
export type SelectVariant = "default" | "filled" | "ghost";

/** Radix Select reserves `""` for "no selection / show placeholder" and refuses
 *  to select an item whose value is `""`. Mapping empty-string options to this
 *  internal sentinel lets callers use `""` naturally (e.g. "Follow active"). */
const EMPTY_VALUE_SENTINEL = "__bl_empty_option__";

function toRadixValue(value: string, hasEmptyOption: boolean): string {
  if (value === "" && hasEmptyOption) return EMPTY_VALUE_SENTINEL;
  return value;
}

function fromRadixValue(value: string): string {
  return value === EMPTY_VALUE_SENTINEL ? "" : value;
}

export interface SelectTriggerProps extends ComponentPropsWithoutRef<
  typeof RadixSelect.Trigger
> {
  size?: SelectSize;
  variant?: SelectVariant;
  fullWidth?: boolean;
  dirty?: boolean;
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
    dirty = false,
    ...props
  },
  ref,
) {
  return (
    <RadixSelect.Trigger
      ref={ref}
      className={`base-select-trigger base-select-trigger--${size} base-select-trigger--${variant} ${fullWidth ? "base-select-trigger--full" : ""} ${dirty ? "base-select-trigger--dirty" : ""} ${className}`.trim()}
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

export interface SelectContentProps extends ComponentPropsWithoutRef<
  typeof RadixSelect.Content
> {
  className?: string;
}

export const SelectContent = forwardRef<
  ElementRef<typeof RadixSelect.Content>,
  SelectContentProps
>(function SelectContent(
  { className = "", children, position = "popper", sideOffset = 5, ...props },
  ref,
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

export interface SelectItemProps extends ComponentPropsWithoutRef<
  typeof RadixSelect.Item
> {
  icon?: ReactNode;
  description?: string;
}

export const SelectItem = forwardRef<
  ElementRef<typeof RadixSelect.Item>,
  SelectItemProps
>(function SelectItem(
  { className = "", children, icon, description, ...props },
  ref,
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
        {description && (
          <span className="base-select-item__desc">{description}</span>
        )}
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
  label?: ReactNode;
  labelIcon?: string;
  tooltip?: ReactNode;
  helperText?: ReactNode;
  error?: string;
  dirty?: boolean;
  rightElement?: ReactNode;
  containerClassName?: string;
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
  label,
  labelIcon,
  tooltip,
  helperText,
  error,
  dirty = false,
  rightElement,
  containerClassName = "",
  size = "md",
  variant = "default",
  disabled = false,
  className = "",
  id,
  fullWidth = false,
  "aria-label": ariaLabel,
}: SimpleSelectProps<T>) {
  const hasEmptyOption = options.some((o) => o.value === "");
  const selectedOption = options.find((o) => o.value === value);
  const radixValue = toRadixValue(value, hasEmptyOption);

  const selectNode = (
    <Select
      value={radixValue}
      onValueChange={(val) => onChange(fromRadixValue(val) as T)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        dirty={dirty}
        className={className}
        aria-label={
          ariaLabel ?? (typeof label === "string" ? label : undefined)
        }
      >
        <SelectValue placeholder={placeholder}>
          {selectedOption ? (
            <span className="base-select-trigger__content">
              {selectedOption.icon && (
                <span className="base-select-trigger__leading-icon">
                  {selectedOption.icon}
                </span>
              )}
              <span className="base-select-trigger__label">
                {selectedOption.label}
              </span>
            </span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => {
          const itemValue = opt.value === "" ? EMPTY_VALUE_SENTINEL : opt.value;
          return (
            <SelectItem
              key={itemValue}
              value={itemValue}
              disabled={opt.disabled}
              icon={opt.icon}
              description={opt.description}
            >
              {opt.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  const isFieldWrapped = Boolean(label || helperText || error);
  const isRowFullWidth = fullWidth || isFieldWrapped;

  const controlNode = rightElement ? (
    <div
      className={`field-input-row field-input-row--${size} ${isRowFullWidth ? "field-input-row--full" : "field-input-row--inline"} has-action has-right-action`}
    >
      {selectNode}
      <div className="field-input-action field-input-action--right">
        {rightElement}
      </div>
    </div>
  ) : (
    selectNode
  );

  if (!isFieldWrapped) {
    return controlNode;
  }

  return (
    <div
      className={`base-form-field form-field ${fullWidth ? "base-form-field--full" : ""} ${disabled ? "base-form-field--disabled" : ""} ${containerClassName}`.trim()}
    >
      {label && (
        <span className="field-label-text">
          {labelIcon && (
            <Icon
              name={labelIcon}
              size={12}
              className="ds-icon-accent shrink-0"
            />
          )}
          <span>{label}</span>
          {tooltip && <TooltipIcon content={tooltip} />}
          {dirty && (
            <Badge variant="warning" size="xs">
              Modified
            </Badge>
          )}
        </span>
      )}
      {controlNode}
      {error ? (
        <p className="field-error-text" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <div className="field-helper-text">{helperText}</div>
      ) : null}
    </div>
  );
}

export default SimpleSelect;
