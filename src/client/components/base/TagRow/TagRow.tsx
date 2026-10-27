import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cleanTag, type TagTaxonomyConfig } from "../../../../engine/tagTaxonomy";
import { Badge } from "../Badge/Badge";
import { Icon } from "../Icon/Icon";
import { TagChip } from "../TagChip/TagChip";
import { Tooltip } from "../Tooltip/Tooltip";
import "./TagRow.css";

export interface TagRowProps {
  tags: string[];
  activeTags?: string[];
  /** Visual item style: `"taxonomy"` renders colored `TagChip` items; `"badge"` renders neutral `Badge` items (e.g. clothing slots). */
  variant?: "taxonomy" | "badge";
  /** Optional fallback badge text when `tags` is empty and `onEditTags` is not provided. */
  emptyLabel?: string;
  taxonomy?: "character" | "playthrough";
  userConfig?: TagTaxonomyConfig | null;
  onToggleTag?: (tag: string) => void;
  onEditTags?: () => void;
  editLabel?: string;
  emptyEditLabel?: string;
  /** Fallback visible count before DOM width measurement runs (e.g. during SSR). Default: 4 per row. */
  initialMaxVisible?: number;
  /** Maximum number of wrapped rows before collapsing overflow tags into a (+N) badge. Default: 1. */
  maxRows?: number;
  /** When true, wraps all tags across multiple lines instead of truncating into a (+N) badge. */
  wrapAll?: boolean;
  className?: string;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Checks whether a sequence of item widths fits within `maxRows` flex-wrapped lines
 * of width `rowWidth` separated by horizontal `gapPx`.
 */
function fitsWithinRows(
  itemWidths: number[],
  rowWidth: number,
  maxRows: number,
  gapPx: number,
): boolean {
  let row = 1;
  let used = 0;
  for (const rawW of itemWidths) {
    const w = Math.min(rawW, rowWidth);
    if (used === 0) {
      used = w;
    } else if (used + gapPx + w <= rowWidth) {
      used += gapPx + w;
    } else {
      row += 1;
      if (row > maxRows) return false;
      used = w;
    }
  }
  return row <= maxRows;
}

/**
 * Tag strip that dynamically measures available horizontal space across 1 or `maxRows` lines
 * and collapses any overflowing tags into a `(+N)` badge with a TagChip tooltip,
 * unless `wrapAll` is enabled by the user's interface preferences.
 */
export function TagRow({
  tags,
  activeTags = [],
  variant = "taxonomy",
  emptyLabel,
  taxonomy = "playthrough",
  userConfig,
  onToggleTag,
  onEditTags,
  editLabel = "Edit",
  emptyEditLabel = "Add tags",
  initialMaxVisible,
  maxRows = 1,
  wrapAll = false,
  className = "",
}: TagRowProps) {
  const effectiveMaxRows = Math.max(1, maxRows);
  const resolvedInitialMax = initialMaxVisible ?? effectiveMaxRows * 4;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);

  const [isClient, setIsClient] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(() =>
    Math.min(tags.length, resolvedInitialMax),
  );

  const activeSet = useMemo(
    () => new Set(activeTags.map((t) => cleanTag(t))),
    [activeTags],
  );

  // Sync fallback when tags array changes
  useEffect(() => {
    setVisibleCount((prev) =>
      Math.min(
        tags.length,
        Math.max(prev, Math.min(tags.length, resolvedInitialMax)),
      ),
    );
  }, [tags, resolvedInitialMax]);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const totalWidth = container.clientWidth;
    if (totalWidth <= 0) return;

    if (tags.length === 0) {
      setVisibleCount(0);
      return;
    }

    const gap = 4;
    const editBtnWidth = editBtnRef.current
      ? editBtnRef.current.offsetWidth
      : 0;

    const chipNodes = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-tag-measure]"),
    );
    if (chipNodes.length !== tags.length) return;

    const chipWidths = chipNodes.map((node) => node.offsetWidth);

    // First check if ALL tags (+ optional Edit button) fit within effectiveMaxRows without needing a (+N) badge
    const allItems =
      editBtnWidth > 0 ? [...chipWidths, editBtnWidth] : chipWidths;
    if (fitsWithinRows(allItems, totalWidth, effectiveMaxRows, gap)) {
      setVisibleCount(tags.length);
      return;
    }

    // Otherwise reserve space for the (+N) overflow badge (~36px) and optional Edit button at the end
    const overflowBadgeWidth = 36;
    const trailingItems =
      editBtnWidth > 0
        ? [overflowBadgeWidth, editBtnWidth]
        : [overflowBadgeWidth];

    let fitCount = 0;
    for (let i = 0; i < chipWidths.length; i++) {
      const candidate = [...chipWidths.slice(0, i + 1), ...trailingItems];
      if (fitsWithinRows(candidate, totalWidth, effectiveMaxRows, gap)) {
        fitCount = i + 1;
      } else {
        break;
      }
    }

    setVisibleCount(fitCount);
  }, [tags, effectiveMaxRows]);

  useIsomorphicLayoutEffect(() => {
    setIsClient(true);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!isClient) return;
    recalculate();
  }, [isClient, recalculate, tags]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      recalculate();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalculate]);

  const clampedVisible = wrapAll
    ? tags.length
    : Math.min(visibleCount, tags.length);
  const visibleTags = tags.slice(0, clampedVisible);
  const hiddenTags = wrapAll ? [] : tags.slice(clampedVisible);

  const tooltipContent =
    hiddenTags.length > 0 ? (
      <div
        className="base-tag-row__tooltip-chips"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {hiddenTags.map((tag) =>
          variant === "badge" ? (
            <Badge key={tag} variant="neutral" size="xs">
              {tag}
            </Badge>
          ) : (
            <TagChip
              key={tag}
              tag={tag}
              size="xs"
              taxonomy={taxonomy}
              userConfig={userConfig}
              active={activeSet.has(cleanTag(tag))}
              showCategoryTooltip={false}
              onClick={
                onToggleTag
                  ? (e) => {
                      e.stopPropagation();
                      onToggleTag(tag);
                    }
                  : undefined
              }
            />
          ),
        )}
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      className={`base-tag-row ${wrapAll || effectiveMaxRows > 1 ? "base-tag-row--wrap" : ""} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      {tags.length === 0 && emptyLabel && !onEditTags ? (
        <Badge variant="neutral" size="xs">
          {emptyLabel}
        </Badge>
      ) : null}

      {visibleTags.map((tag) =>
        variant === "badge" ? (
          <Badge key={tag} variant="neutral" size="xs">
            {tag}
          </Badge>
        ) : (
          <TagChip
            key={tag}
            tag={tag}
            size="xs"
            taxonomy={taxonomy}
            userConfig={userConfig}
            active={activeSet.has(cleanTag(tag))}
            onClick={onToggleTag ? () => onToggleTag(tag) : undefined}
          />
        ),
      )}

      {hiddenTags.length > 0 ? (
        <Tooltip
          content={tooltipContent}
          side="top"
          align="center"
          delayDuration={120}
          interactive
        >
          <span
            tabIndex={0}
            className="base-tag-row__overflow-trigger"
            aria-label={`${hiddenTags.length} more items: ${hiddenTags.join(", ")}`}
          >
            <Badge variant="neutral" size="xs">
              +{hiddenTags.length}
            </Badge>
          </span>
        </Tooltip>
      ) : null}

      {onEditTags ? (
        <button
          ref={editBtnRef}
          type="button"
          className="base-tag-row__edit-btn"
          onClick={onEditTags}
          title="Edit tags"
        >
          <Icon name="Tag" size={10} />
          <span>{tags.length === 0 ? emptyEditLabel : editLabel}</span>
        </button>
      ) : null}

      {isClient && !wrapAll && tags.length > 0 ? (
        <div
          ref={measureRef}
          className="base-tag-row__measure"
          aria-hidden="true"
        >
          {tags.map((tag) => (
            <span key={tag} data-tag-measure="">
              {variant === "badge" ? (
                <Badge variant="neutral" size="xs">
                  {tag}
                </Badge>
              ) : (
                <TagChip
                  tag={tag}
                  size="xs"
                  taxonomy={taxonomy}
                  userConfig={userConfig}
                  showCategoryTooltip={false}
                />
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default TagRow;
