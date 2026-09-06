import React, { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";

export type TabItem<T extends string = string> = {
  id: T;
  label: React.ReactNode;
  icon?: IconName;
  badge?: React.ReactNode;
  disabled?: boolean;
  title?: string;
};

export type TabsProps<T extends string = string> = {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  variant?: "underline" | "pill" | "enclosed";
  size?: "sm" | "md";
  fullWidth?: boolean;
  sticky?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  size = "md",
  fullWidth = false,
  sticky = false,
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
              if (!tab.disabled && !isActive) {
                onChange(tab.id);
              }
            }}
          >
            {tab.icon && (
              <Icon
                name={tab.icon}
                size={size === "sm" ? 14 : 16}
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
