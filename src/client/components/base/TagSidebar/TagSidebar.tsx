import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cleanTag,
  groupTagsByCategory,
  resolveTagStyle,
  type GroupedTagCategory,
  type TagStyle,
  type TagTaxonomyConfig,
} from "../../../../engine/tagTaxonomy";
import {
  groupPlaythroughTagsByCategory,
  resolvePlaythroughTagStyle,
} from "../../../../engine/playthroughTagTaxonomy";
import { Icon } from "../Icon/Icon";
import { TagChip } from "../TagChip/TagChip";
import "./TagSidebar.css";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type TagSidebarLayoutMetrics = {
  /** Visible height of the scroll container (0 in non-layout test environments) */
  containerHeight: number;
  /** Bottom inner content edge of the scroll container in viewport coordinates */
  containerContentBottom: number;
  /** Current vertical scroll offset of the scroll container */
  scrollTop: number;
  /** Top edge of the parent flex row in viewport coordinates */
  rowTop: number;
  /** Top edge of the sticky sidebar in viewport coordinates */
  sidebarTop: number;
  /** Height of the sibling content column beside the sidebar */
  siblingHeight: number;
};

/**
 * Computes the maximum pixel height for `TagSidebar` so that:
 * 1. When the sibling content column fits within the viewport (`siblingHeight <= unscrolledAvailable`),
 *    `TagSidebar` caps at `unscrolledAvailable` (the space from the sidebar's initial top edge to the
 *    bottom of the scroll container), preventing the sidebar from forcing a page-level scrollbar.
 * 2. When the sibling content column is taller than the viewport and the user scrolls down,
 *    `TagSidebar` smoothly expands up to `currentVisibleAvailable` (capped by `siblingHeight`) as the
 *    page header scrolls out of view.
 */
export function computeTagSidebarMaxHeight(
  metrics: TagSidebarLayoutMetrics,
): number | null {
  if (metrics.containerHeight <= 0) return null;

  const unscrolledRowTop = metrics.rowTop + metrics.scrollTop;
  const unscrolledAvailable = Math.floor(
    metrics.containerContentBottom - unscrolledRowTop - 1,
  );
  const currentVisibleAvailable = Math.floor(
    metrics.containerContentBottom - metrics.sidebarTop - 1,
  );

  const maxAllowed = Math.max(
    unscrolledAvailable,
    Math.min(currentVisibleAvailable, Math.floor(metrics.siblingHeight)),
  );

  return Math.max(160, maxAllowed);
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export type TagSidebarProps = {
  /** Array of tags and their occurrence counts across the library */
  tagCounts: ReadonlyArray<{ tag: string; count: number }>;
  /** Currently active/selected filter tags */
  activeTags: readonly string[];
  /** Callback when a tag is clicked to toggle its filter state */
  onToggleTag: (tag: string) => void;
  /** Callback to clear all active tag filters */
  onClearTags?: () => void;
  /** Built-in taxonomy preset ("playthrough" | "character") */
  taxonomy?: "playthrough" | "character";
  /** Optional custom taxonomy configuration */
  userConfig?: TagTaxonomyConfig | null;
  /** Optional custom grouping override */
  groupTags?: (
    counts: Array<{ tag: string; count: number }>,
    userConfig?: TagTaxonomyConfig | null,
  ) => GroupedTagCategory[];
  /** Optional custom style resolver override */
  resolveStyle?: (
    tag: string,
    userConfig?: TagTaxonomyConfig | null,
  ) => TagStyle;
  /** Optional callback to open taxonomy settings modal */
  onOpenSettings?: () => void;
  /** Sidebar title (default: "Tags") */
  title?: string;
  /** Empty state message when library has no tags */
  emptyMessage?: string;
  /** Initial view mode: "grouped" by category or "flat" by count */
  defaultMode?: "grouped" | "flat";
  /** Optional controlled view mode ("grouped" | "flat") */
  mode?: "grouped" | "flat";
  /** Callback when view mode changes */
  onModeChange?: (mode: "grouped" | "flat") => void;
  /** Optional controlled set of collapsed category IDs */
  collapsedCategories?: ReadonlySet<string>;
  /** Callback when a category header is toggled */
  onToggleCategory?: (categoryId: string) => void;
  /** Extra CSS class name */
  className?: string;
};

export function TagSidebar({
  tagCounts,
  activeTags,
  onToggleTag,
  onClearTags,
  taxonomy = "playthrough",
  userConfig,
  groupTags,
  resolveStyle,
  onOpenSettings,
  title = "Tags",
  emptyMessage = "No tags yet.",
  defaultMode = "grouped",
  mode: controlledMode,
  onModeChange,
  collapsedCategories: controlledCollapsed,
  onToggleCategory,
  className = "",
}: TagSidebarProps) {
  const [search, setSearch] = useState("");
  const [internalMode, setInternalMode] = useState<"grouped" | "flat">(
    defaultMode,
  );
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(
    new Set(),
  );
  const mode = controlledMode ?? internalMode;
  const collapsedCategories = controlledCollapsed ?? internalCollapsed;
  const [mobileCollapsed, setMobileCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const recalculateMaxHeight = useCallback(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || typeof window === "undefined") return;

    const scrollContainer = findScrollContainer(sidebar);
    const containerRect = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : null;
    const containerHeight = containerRect
      ? containerRect.height
      : window.innerHeight;

    let containerContentBottom: number;
    if (scrollContainer && containerRect) {
      const style = window.getComputedStyle(scrollContainer);
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;
      containerContentBottom =
        containerRect.bottom - paddingBottom - borderBottom;
    } else {
      containerContentBottom = window.innerHeight - 16;
    }

    const scrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : window.scrollY;

    const row = sidebar.parentElement;
    const sidebarRect = sidebar.getBoundingClientRect();
    const rowTop = row ? row.getBoundingClientRect().top : sidebarRect.top;

    let siblingHeight = 0;
    if (row) {
      for (const child of Array.from(row.children)) {
        if (child !== sidebar && child instanceof HTMLElement) {
          siblingHeight = Math.max(
            siblingHeight,
            child.getBoundingClientRect().height,
          );
        }
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
      sidebar.style.setProperty("--tag-sidebar-max-height", `${maxHeight}px`);
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    recalculateMaxHeight();
  }, [recalculateMaxHeight, tagCounts.length, activeTags.length]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || typeof window === "undefined") return;

    const scrollContainer = findScrollContainer(sidebar);
    const row = sidebar.parentElement;
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
      if (scrollContainer) observer.observe(scrollContainer);
      if (row) {
        observer.observe(row);
        for (const child of Array.from(row.children)) {
          if (child !== sidebar) {
            observer.observe(child);
          }
        }
      }
    }

    return () => {
      scrollTarget.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      observer?.disconnect();
    };
  }, [recalculateMaxHeight]);

  const activeSet = useMemo(
    () => new Set(activeTags.map((t) => cleanTag(t))),
    [activeTags],
  );

  const filteredCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const normQ = cleanTag(q);
    if (!q) return [...tagCounts];
    return tagCounts.filter(
      (item) =>
        item.tag.toLowerCase().includes(q) ||
        (normQ && cleanTag(item.tag).includes(normQ)),
    );
  }, [tagCounts, search]);

  const resolveItemStyle = useMemo(() => {
    if (resolveStyle) return resolveStyle;
    return taxonomy === "playthrough"
      ? resolvePlaythroughTagStyle
      : resolveTagStyle;
  }, [resolveStyle, taxonomy]);

  const groupedCategories = useMemo((): GroupedTagCategory[] => {
    if (groupTags) return groupTags(filteredCounts, userConfig);
    return taxonomy === "playthrough"
      ? groupPlaythroughTagsByCategory(filteredCounts, userConfig)
      : groupTagsByCategory(filteredCounts, userConfig);
  }, [filteredCounts, groupTags, taxonomy, userConfig]);

  function toggleCategory(catId: string) {
    if (onToggleCategory) {
      onToggleCategory(catId);
      return;
    }
    setInternalCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function handleToggleMode() {
    const nextMode = mode === "grouped" ? "flat" : "grouped";
    if (onModeChange) {
      onModeChange(nextMode);
    } else {
      setInternalMode(nextMode);
    }
  }

  const classes = [
    "base-tag-sidebar",
    mobileCollapsed ? "is-collapsed" : "is-expanded",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      ref={sidebarRef}
      className={classes}
      aria-label={`${title} filter sidebar`}
    >
      <div className="base-tag-sidebar__header">
        <div className="base-tag-sidebar__title-group">
          <h4 className="base-tag-sidebar__title">
            <Icon name="Tag" size={12} />
            <span>{title}</span>
          </h4>
          <span className="base-tag-sidebar__total">{tagCounts.length}</span>
        </div>

        <div className="base-tag-sidebar__actions">
          <button
            type="button"
            className="base-tag-sidebar__mobile-toggle"
            onClick={() => setMobileCollapsed((prev) => !prev)}
            aria-expanded={!mobileCollapsed}
          >
            <span>{mobileCollapsed ? "Show" : "Hide"}</span>
            <Icon
              name={mobileCollapsed ? "ChevronDown" : "ChevronUp"}
              size={12}
            />
          </button>

          <button
            type="button"
            className={`base-tag-sidebar__icon-btn ${mode === "grouped" ? "is-active" : ""}`}
            onClick={handleToggleMode}
            title={
              mode === "grouped"
                ? "Grouped by category (click for flat list)"
                : "Flat list by count (click for categories)"
            }
            aria-label={
              mode === "grouped"
                ? "Switch to flat tag list"
                : "Switch to categorized tag list"
            }
          >
            <Icon name={mode === "grouped" ? "Layers" : "List"} size={12} />
          </button>

          {onOpenSettings && (
            <button
              type="button"
              className="base-tag-sidebar__icon-btn"
              onClick={onOpenSettings}
              title="Configure Tag Categories & Colors"
              aria-label="Configure Tag Categories & Colors"
            >
              <Icon name="Settings" size={12} />
            </button>
          )}

          {activeTags.length > 0 && onClearTags && (
            <button
              type="button"
              className="base-tag-sidebar__clear-btn"
              onClick={onClearTags}
              title="Clear all active tag filters"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {activeTags.length > 0 && (
        <div className="base-tag-sidebar__active-strip">
          {activeTags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              size="xs"
              active
              taxonomy={taxonomy}
              userConfig={userConfig}
              resolveStyle={resolveStyle}
              onClick={() => onToggleTag(tag)}
              onRemove={() => onToggleTag(tag)}
              title={`Remove filter "${tag}"`}
            />
          ))}
        </div>
      )}

      <div className="base-tag-sidebar__body">
        {tagCounts.length > 4 && (
          <div className="base-tag-sidebar__search">
            <span className="base-tag-sidebar__search-icon" aria-hidden="true">
              <Icon name="Search" size={11} />
            </span>
            <input
              type="text"
              className="base-tag-sidebar__search-input"
              placeholder="Filter tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter tags in sidebar"
            />
            {search && (
              <button
                type="button"
                className="base-tag-sidebar__search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear tag filter search"
              >
                <Icon name="X" size={11} />
              </button>
            )}
          </div>
        )}

        <div className="base-tag-sidebar__list">
          {filteredCounts.length === 0 ? (
            <p className="base-tag-sidebar__empty">
              {tagCounts.length === 0 ? emptyMessage : "No matching tags."}
            </p>
          ) : mode === "grouped" ? (
            groupedCategories.map((group) => {
              const isCollapsed = collapsedCategories.has(group.id);
              return (
                <div key={group.id} className="base-tag-sidebar__group">
                  <button
                    type="button"
                    className="base-tag-sidebar__group-header"
                    onClick={() => toggleCategory(group.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="base-tag-sidebar__group-title">
                      <span
                        className="base-tag-sidebar__group-dot"
                        style={
                          {
                            "--cat-dot-dark": group.color,
                            "--cat-dot-light": group.colorLight || group.color,
                          } as React.CSSProperties
                        }
                      />
                      <span className="base-tag-sidebar__group-label">
                        {group.label}
                      </span>
                    </span>
                    <span className="base-tag-sidebar__group-meta">
                      <span className="base-tag-sidebar__group-count">
                        {group.tags.length}
                      </span>
                      <Icon
                        name={isCollapsed ? "ChevronRight" : "ChevronDown"}
                        size={11}
                      />
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="base-tag-sidebar__group-items">
                      {group.tags.map(({ tag, count, style }) => {
                        const isActive = activeSet.has(cleanTag(tag));
                        const darkColor =
                          style.colorsDark?.text || style.colors.text;
                        const lightColor = style.colorsLight?.text || darkColor;
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`base-tag-sidebar__item ${isActive ? "is-active" : ""}`}
                            style={
                              {
                                "--tag-row-color": darkColor,
                                "--tag-row-color-light": lightColor,
                              } as React.CSSProperties
                            }
                            onClick={() => onToggleTag(tag)}
                            title={`Filter by "${tag}" (${count})`}
                          >
                            <span className="base-tag-sidebar__item-label">
                              {style.namespace && (
                                <span className="base-tag-sidebar__item-ns">
                                  {style.namespace}:
                                </span>
                              )}
                              <span className="base-tag-sidebar__item-name">
                                {style.value || style.displayLabel}
                              </span>
                            </span>
                            <span className="base-tag-sidebar__item-count">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            filteredCounts.map(({ tag, count }) => {
              const isActive = activeSet.has(cleanTag(tag));
              const style = resolveItemStyle(tag, userConfig);
              const darkColor = style.colorsDark?.text || style.colors.text;
              const lightColor = style.colorsLight?.text || darkColor;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`base-tag-sidebar__item ${isActive ? "is-active" : ""}`}
                  style={
                    {
                      "--tag-row-color": darkColor,
                      "--tag-row-color-light": lightColor,
                    } as React.CSSProperties
                  }
                  onClick={() => onToggleTag(tag)}
                  title={`[${style.categoryLabel}] Filter by "${tag}" (${count})`}
                >
                  <span className="base-tag-sidebar__item-label">
                    {style.namespace && (
                      <span className="base-tag-sidebar__item-ns">
                        {style.namespace}:
                      </span>
                    )}
                    <span className="base-tag-sidebar__item-name">
                      {style.value || style.displayLabel}
                    </span>
                  </span>
                  <span className="base-tag-sidebar__item-count">{count}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
