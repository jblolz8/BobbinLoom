import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../Icon/Icon";
import {
  computeBottomInsetToScrollContainer,
  computeTagSidebarMaxHeight,
  findScrollContainer,
} from "../TagSidebar/TagSidebar";
import "./SideNav.css";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** One row of the nav: what to select, and what to show. */
export type SideNavItem = {
  id: string;
  label: ReactNode;
  /** Optional leading icon. */
  icon?: IconName;
  /** An optional trailing badge — a count, a mark. */
  meta?: ReactNode;
  disabled?: boolean;
};

/** A labelled group of rows. */
export type SideNavSection = {
  label: string;
  items: SideNavItem[];
};

export type SideNavWidth = "sm" | "md" | "lg";

export type SideNavProps = {
  /** The element's id, so the consumer's toggle can carry `aria-controls` and `aria-expanded`. */
  id: string;
  ariaLabel: string;
  title?: ReactNode;
  /** Flat list of navigation items (used when sections are not needed, e.g. Settings). */
  items?: SideNavItem[];
  /** Grouped sections of navigation items (used by Docs and Gallery). */
  sections?: SideNavSection[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Width preset on desktop viewports: `sm` (210px), `md` (236px, default), `lg` (280px). */
  width?: SideNavWidth;
  /** Sits under the title, above the list (e.g. search bar or action button). */
  headerExtra?: ReactNode;
  /** Replaces the grouped/flat list outright — e.g. custom cards or search results. */
  listOverride?: ReactNode;
  /** Wide screens: the column is collapsed away. */
  hidden?: boolean;
  /** Narrow screens: the drawer is out. */
  open?: boolean;
  /** Draw a scrim under the drawer (narrow + open only). */
  showScrim?: boolean;
  onScrimClick?: () => void;
  emptyLabel?: string;
  className?: string;
};

export type SideNavLayoutProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Minimum height preset when embedded inside a scrollable page/editor. */
  minHeight?: "none" | "md" | "lg";
};

export const SideNavLayout = React.forwardRef<
  HTMLDivElement,
  SideNavLayoutProps
>(function SideNavLayout(
  { minHeight = "none", className = "", children, ...props },
  ref,
) {
  const classes = [
    "side-nav-layout",
    minHeight !== "none" ? `side-nav-layout--min-${minHeight}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} {...props}>
      {children}
    </div>
  );
});

export type SideNavMainProps = React.HTMLAttributes<HTMLDivElement>;

export const SideNavMain = React.forwardRef<HTMLDivElement, SideNavMainProps>(
  function SideNavMain({ className = "", children, ...props }, ref) {
    const classes = ["side-nav-main", className].filter(Boolean).join(" ");
    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  },
);

export type SideNavToolbarProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Only display this toolbar on narrow/mobile viewports where the drawer mode is active. */
  mobileOnly?: boolean;
  /** Draw a subtle bottom divider below the toolbar. */
  bordered?: boolean;
  /** Keep the toolbar sticky at the top of its scroll container while reading long content. */
  sticky?: boolean;
};

export const SideNavToolbar = React.forwardRef<
  HTMLDivElement,
  SideNavToolbarProps
>(function SideNavToolbar(
  {
    mobileOnly = false,
    bordered = false,
    sticky = false,
    className = "",
    children,
    ...props
  },
  ref,
) {
  const classes = [
    "side-nav-toolbar",
    mobileOnly ? "side-nav-toolbar--mobile-only" : "",
    bordered ? "side-nav-toolbar--bordered" : "",
    sticky ? "side-nav-toolbar--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} {...props}>
      {children}
    </div>
  );
});

export type SideNavTriggerProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> & {
  /** ID of the controlled SideNav element (`aria-controls`). */
  controlsId: string;
  /** Whether the SideNav is currently visible (`nav.shown`). */
  open: boolean;
  /** Optional custom leading icon overriding the default PanelLeft / PanelLeftClose glyph. */
  icon?: IconName;
  /** Primary label rendered inside the trigger button. */
  label: ReactNode;
  /** Optional badge or count pill rendered after the label. */
  badge?: ReactNode;
  /** Optional trailing disclosure icon (e.g. "ChevronRight" or "ChevronsUpDown"). */
  trailingIcon?: IconName;
  /** Optional tooltip / native title text. */
  tooltip?: string;
};

export const SideNavTrigger = React.forwardRef<
  HTMLButtonElement,
  SideNavTriggerProps
>(function SideNavTrigger(
  {
    controlsId,
    open,
    icon,
    label,
    badge,
    trailingIcon,
    tooltip,
    className = "",
    ...props
  },
  ref,
) {
  const resolvedIcon: IconName =
    icon ?? (open ? "PanelLeftClose" : "PanelLeft");
  const classes = [
    "side-nav-trigger",
    open ? "is-open" : "is-closed",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-expanded={open}
      aria-controls={controlsId}
      title={tooltip}
      {...props}
    >
      <span className="side-nav-trigger__icon" aria-hidden="true">
        <Icon name={resolvedIcon} size={15} />
      </span>
      <span className="side-nav-trigger__label">{label}</span>
      {badge ? <span className="side-nav-trigger__badge">{badge}</span> : null}
      {trailingIcon ? (
        <span className="side-nav-trigger__trailing" aria-hidden="true">
          <Icon name={trailingIcon} size={14} />
        </span>
      ) : null}
    </button>
  );
});

function renderNavItem(
  item: SideNavItem,
  activeId: string | undefined,
  onSelect: ((id: string) => void) | undefined,
) {
  const isActive = item.id === activeId;
  return (
    <button
      key={item.id}
      type="button"
      disabled={item.disabled}
      className={`side-nav-item ${isActive ? "active" : ""}`.trim()}
      onClick={() => {
        if (!item.disabled) {
          onSelect?.(item.id);
        }
      }}
      aria-current={isActive ? "true" : undefined}
    >
      {item.icon || item.meta ? (
        <span className="side-nav-item-row">
          <span className="side-nav-item-leading">
            {item.icon ? (
              <Icon name={item.icon} size={15} className="side-nav-item-icon" />
            ) : null}
            <span className="side-nav-item-label">{item.label}</span>
          </span>
          {item.meta ? (
            <span className="side-nav-item-meta">{item.meta}</span>
          ) : null}
        </span>
      ) : (
        item.label
      )}
    </button>
  );
}

function SideNavRoot({
  id,
  ariaLabel,
  title,
  items,
  sections = [],
  activeId,
  onSelect,
  width = "md",
  headerExtra,
  listOverride,
  hidden = false,
  open = false,
  showScrim = false,
  onScrimClick,
  emptyLabel = "Nothing to show yet.",
  className: extraClassName = "",
}: SideNavProps) {
  const navRef = useRef<HTMLElement | null>(null);

  const recalculateMaxHeight = useCallback(() => {
    const sidebar = navRef.current;
    if (!sidebar || typeof window === "undefined") return;

    const row = sidebar.parentElement;
    if (!row || !row.classList.contains("side-nav-layout")) return;

    const scrollContainer = findScrollContainer(sidebar);
    const containerRect = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : null;
    const containerHeight = containerRect
      ? containerRect.height
      : window.innerHeight;

    const sidebarRect = sidebar.getBoundingClientRect();
    const rowTop = row.getBoundingClientRect().top;

    let containerContentBottom: number;
    if (scrollContainer && containerRect) {
      const bottomInset = computeBottomInsetToScrollContainer(
        row,
        scrollContainer,
      );
      containerContentBottom = Math.floor(
        containerRect.bottom - bottomInset - 1,
      );
    } else {
      containerContentBottom = window.innerHeight - 16;
    }

    const scrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : window.scrollY;

    let siblingHeight = 0;
    for (const child of Array.from(row.children)) {
      if (child !== sidebar && child instanceof HTMLElement) {
        siblingHeight = Math.max(
          siblingHeight,
          child.getBoundingClientRect().height,
        );
      }
    }

    const maxHeight = computeTagSidebarMaxHeight({
      containerHeight,
      containerContentBottom,
      scrollTop,
      rowTop,
      sidebarTop: sidebarRect.top,
      siblingHeight,
    });

    if (maxHeight !== null) {
      sidebar.style.setProperty("--side-nav-max-height", `${maxHeight}px`);
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!hidden) {
      recalculateMaxHeight();
    }
  }, [recalculateMaxHeight, hidden, open, items?.length, sections.length]);

  useEffect(() => {
    const sidebar = navRef.current;
    if (!sidebar || typeof window === "undefined") return;

    const row = sidebar.parentElement;
    if (!row || !row.classList.contains("side-nav-layout")) return;

    const scrollContainer = findScrollContainer(sidebar);
    const scrollTarget: EventTarget = scrollContainer ?? window;

    const handleScrollOrResize = () => {
      recalculateMaxHeight();
    };

    scrollTarget.addEventListener("scroll", handleScrollOrResize, {
      passive: true,
    });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleScrollOrResize);
      if (scrollContainer) {
        observer.observe(scrollContainer);
        if (scrollContainer.firstElementChild) {
          observer.observe(scrollContainer.firstElementChild);
        }
      }
      observer.observe(row);
      if (row.parentElement) {
        observer.observe(row.parentElement);
      }
      for (const child of Array.from(row.children)) {
        if (child !== sidebar) {
          observer.observe(child);
        }
      }
    }

    return () => {
      scrollTarget.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      observer?.disconnect();
    };
  }, [recalculateMaxHeight, hidden]);

  useEffect(() => {
    if (!open || !onScrimClick || typeof document === "undefined") return;
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onScrimClick?.();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [open, onScrimClick]);

  const className = [
    "side-nav",
    width !== "md" ? `side-nav--${width}` : "",
    hidden ? "is-hidden" : "",
    open ? "is-open" : "",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const hasFlatItems = Array.isArray(items) && items.length > 0;
  const isEmpty =
    !hasFlatItems && sections.every((section) => section.items.length === 0);

  return (
    <>
      <nav
        ref={navRef}
        className={className}
        id={id}
        aria-label={ariaLabel}
        aria-hidden={hidden}
      >
        {title || (open && onScrimClick) ? (
          <div className="side-nav-header">
            {title ? <span className="side-nav-title">{title}</span> : <span />}
            {open && onScrimClick ? (
              <button
                type="button"
                className="side-nav-close-btn"
                onClick={onScrimClick}
                aria-label="Close sidebar"
                title="Close sidebar"
              >
                <Icon name="PanelLeftClose" size={15} />
              </button>
            ) : null}
          </div>
        ) : null}

        {headerExtra ? (
          <div className="side-nav-header-extra">{headerExtra}</div>
        ) : null}

        <div className="side-nav-list">
          {listOverride ?? (
            <>
              {hasFlatItems ? (
                <div className="side-nav-group">
                  {items.map((item) => renderNavItem(item, activeId, onSelect))}
                </div>
              ) : (
                sections.map((section) => (
                  <div className="side-nav-group" key={section.label}>
                    <span className="side-nav-group-label">
                      {section.label}
                    </span>
                    {section.items.map((item) =>
                      renderNavItem(item, activeId, onSelect),
                    )}
                  </div>
                ))
              )}
              {isEmpty ? <p className="side-nav-empty">{emptyLabel}</p> : null}
            </>
          )}
        </div>
      </nav>

      {showScrim ? (
        <div className="side-nav-scrim" onClick={onScrimClick} />
      ) : null}
    </>
  );
}

export const SideNav = Object.assign(SideNavRoot, {
  Layout: SideNavLayout,
  Main: SideNavMain,
  Toolbar: SideNavToolbar,
  Trigger: SideNavTrigger,
});
