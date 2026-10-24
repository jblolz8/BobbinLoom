import React, { useEffect, useRef } from "react";
import { Icon, type IconName } from "../Icon";

export type TabItem<T extends string = string> = {
  id: T;
  label: React.ReactNode;
  icon?: IconName;
  badge?: React.ReactNode;
  disabled?: boolean;
  title?: string;
};

export type TabsVariant = "underline" | "pill" | "enclosed" | "segmented" | "sidebar";

export type TabsProps<T extends string = string> = {
  tabs: TabItem<T>[];
  activeTab?: T | null;
  onChange: (tabId: T) => void;
  variant?: TabsVariant;
  size?: "sm" | "md";
  fullWidth?: boolean;
  sticky?: boolean;
  /** Invoke `onChange` even when clicking the already-active tab. */
  allowReselect?: boolean;
  className?: string;
  ariaLabel?: string;
};

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  active: boolean;
  children?: React.ReactNode;
}

export const TabPanel = React.forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { active, className = "", children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="tabpanel"
      hidden={!active}
      className={["base-tab-panel", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </div>
  );
});

function TabsRoot<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  size = "md",
  fullWidth = false,
  sticky = false,
  allowReselect = false,
  className = "",
  ariaLabel,
}: TabsProps<T>) {
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
          el.scrollLeft += delta;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const containerClasses = [
    "base-tabs",
    `base-tabs--${variant}`,
    `base-tabs--${size}`,
    fullWidth ? "base-tabs--full-width" : "",
    sticky ? "base-tabs--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      role="tablist"
      aria-orientation={variant === "sidebar" ? "vertical" : undefined}
      aria-label={ariaLabel}
      ref={tabsRef}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const tabClasses = [
          "base-tab",
          `base-tab--${variant}`,
          `base-tab--${size}`,
          isActive ? "active" : "",
          tab.disabled ? "disabled" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            title={tab.title}
            className={tabClasses}
            onClick={() => {
              if (!tab.disabled && (allowReselect || !isActive)) {
                onChange(tab.id);
              }
            }}
          >
            {tab.icon && (
              <Icon
                name={tab.icon}
                size={
                  variant === "segmented" || variant === "sidebar"
                    ? 15
                    : size === "sm"
                      ? 14
                      : 16
                }
                className="base-tab__icon"
              />
            )}
            <span className="base-tab__label">{tab.label}</span>
            {tab.badge && <span className="base-tab__badge">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const Tabs = Object.assign(TabsRoot, {
  Panel: TabPanel,
});
