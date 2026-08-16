import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  containerClassName?: string;
  rightAction?: ReactNode;
  iconName?: "Search" | "Filter" | "Tag";
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    value,
    onChange,
    onClear,
    placeholder = "Search…",
    size = "md",
    className = "",
    containerClassName = "",
    rightAction,
    iconName = "Search",
    onKeyDown,
    ...inputProps
  },
  ref
) {
  function handleClear() {
    onChange("");
    if (onClear) onClear();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && value) {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  }

  const iconSizes = {
    sm: 13,
    md: 15,
    lg: 17,
  };

  return (
    <div className={`base-search-bar search-bar-${size} ${containerClassName}`.trim()}>
      <span className="base-search-icon" aria-hidden="true">
        <Icon name={iconName} size={iconSizes[size]} />
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`base-search-input ${className}`.trim()}
        {...inputProps}
      />
      {value ? (
        <button
          type="button"
          className="base-search-clear-btn"
          onClick={handleClear}
          title="Clear search"
          aria-label="Clear search"
        >
          <Icon name="X" size={size === "sm" ? 12 : 14} />
        </button>
      ) : null}
      {rightAction && <div className="base-search-right-action">{rightAction}</div>}
    </div>
  );
});
