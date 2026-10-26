import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { Tooltip, TooltipIcon } from "../Tooltip/Tooltip";
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

export type SortSelectDirection = "asc" | "desc";

export interface SortSelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional custom leading icon. Defaults to `<Icon name="ArrowUpDown" size={12} />` when omitted; pass `null` to hide. */
  icon?: ReactNode | null;
  description?: string;
  disabled?: boolean;
  /** Short label shown on the direction toggle button when `direction === "asc"` (e.g. "A-Z", "Oldest"). */
  ascLabel?: string;
  /** Short label shown on the direction toggle button when `direction === "desc"` (e.g. "Z-A", "Newest"). */
  descLabel?: string;
  /** Tooltip shown on the direction toggle button when `direction === "asc"`. */
  ascTooltip?: string;
  /** Tooltip shown on the direction toggle button when `direction === "desc"`. */
  descTooltip?: string;
}

export interface SortSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  direction: SortSelectDirection;
  /** Called with the toggled direction (`"asc"` or `"desc"`). Either `onDirectionChange` or `onToggleDirection` may be provided. */
  onDirectionChange?: (nextDirection: SortSelectDirection) => void;
  /** Convenience callback invoked when the direction button is clicked. */
  onToggleDirection?: () => void;
  options: Array<SortSelectOption<T>>;
  size?: SelectSize;
  disabled?: boolean;
  /** Whether to show the short text label (e.g. `"A-Z"` / `"Newest"`) inside the direction toggle button. Defaults to `true`. */
  showDirectionLabel?: boolean;
  className?: string;
  id?: string;
  /** Accessible label for the joined control group. Defaults to `"Sort controls"`. */
  groupAriaLabel?: string;
  /** Accessible label for the sort field dropdown trigger. Defaults to `"Sort by"`. */
  "aria-label"?: string;
  /** Accessible label for the direction toggle button. Defaults to `"Toggle sort order"`. */
  directionAriaLabel?: string;
}

function resolveSortDirectionMeta(
  option: SortSelectOption<string> | undefined,
  value: string,
  direction: SortSelectDirection,
): { label: string; tooltip: string } {
  const isAlpha = value === "name" || value === "label";
  const isDefault = value === "default";

  const defaultAscLabel = isAlpha ? "A-Z" : isDefault ? "First" : "Oldest";
  const defaultDescLabel = isAlpha ? "Z-A" : isDefault ? "Last" : "Newest";

  const defaultAscTooltip = isAlpha
    ? "Sort A to Z (click for Z to A)"
    : isDefault
      ? "Default first (click for Default last)"
      : "Oldest first (click for Newest first)";
  const defaultDescTooltip = isAlpha
    ? "Sort Z to A (click for A to Z)"
    : isDefault
      ? "Default last (click for Default first)"
      : "Newest first (click for Oldest first)";

  if (direction === "asc") {
    return {
      label: option?.ascLabel ?? defaultAscLabel,
      tooltip: option?.ascTooltip ?? defaultAscTooltip,
    };
  }
  return {
    label: option?.descLabel ?? defaultDescLabel,
    tooltip: option?.descTooltip ?? defaultDescTooltip,
  };
}

export function SortSelect<T extends string = string>({
  value,
  onChange,
  direction,
  onDirectionChange,
  onToggleDirection,
  options,
  size = "sm",
  disabled = false,
  showDirectionLabel = true,
  className = "",
  id,
  groupAriaLabel = "Sort controls",
  "aria-label": ariaLabel = "Sort by",
  directionAriaLabel = "Toggle sort order",
}: SortSelectProps<T>) {
  const hasEmptyOption = options.some((o) => o.value === "");
  const selectedOption = options.find((o) => o.value === value);
  const radixValue = toRadixValue(value, hasEmptyOption);

  const { label: dirLabel, tooltip: dirTooltip } = resolveSortDirectionMeta(
    selectedOption,
    value,
    direction,
  );

  const handleToggle = () => {
    const next: SortSelectDirection = direction === "asc" ? "desc" : "asc";
    onDirectionChange?.(next);
    onToggleDirection?.();
  };

  const defaultOptionIcon = <Icon name="ArrowUpDown" size={12} />;

  const resolveOptionIcon = (opt: SortSelectOption<T>): ReactNode => {
    if (opt.icon === null) return undefined;
    return opt.icon ?? defaultOptionIcon;
  };

  const selectedIcon = selectedOption
    ? resolveOptionIcon(selectedOption)
    : undefined;

  return (
    <div
      role="group"
      aria-label={groupAriaLabel}
      className={`base-sort-select base-sort-select--${size} ${disabled ? "base-sort-select--disabled" : ""} ${className}`.trim()}
    >
      <Select
        value={radixValue}
        onValueChange={(val) => onChange(fromRadixValue(val) as T)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          size={size}
          variant="ghost"
          fullWidth={false}
          className="base-sort-select__trigger"
          aria-label={ariaLabel}
        >
          <SelectValue>
            {selectedOption ? (
              <span className="base-select-trigger__content">
                {selectedIcon && (
                  <span className="base-select-trigger__leading-icon">
                    {selectedIcon}
                  </span>
                )}
                <span className="base-select-trigger__label">
                  {selectedOption.label}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const itemValue =
              opt.value === "" ? EMPTY_VALUE_SENTINEL : opt.value;
            return (
              <SelectItem
                key={itemValue}
                value={itemValue}
                disabled={opt.disabled}
                icon={resolveOptionIcon(opt)}
                description={opt.description}
              >
                {opt.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Tooltip content={dirTooltip}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          iconOnly={!showDirectionLabel || !dirLabel}
          disabled={disabled}
          className="base-sort-select__dir-btn"
          onClick={handleToggle}
          aria-label={directionAriaLabel}
          leftIcon={
            <Icon
              name={
                direction === "asc"
                  ? "ArrowUpNarrowWide"
                  : "ArrowDownWideNarrow"
              }
              size={size === "xs" ? 13 : 14}
            />
          }
        >
          {showDirectionLabel && dirLabel ? (
            <span className="base-sort-select__dir-label">{dirLabel}</span>
          ) : null}
        </Button>
      </Tooltip>
    </div>
  );
}

export default SimpleSelect;
