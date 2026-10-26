import { useEffect, useState } from "react";
import {
  ALL_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
  isPresetPageSize,
  parsePageSizeInput,
  rangeParts,
  totalPagesFor,
  type PageSize,
} from "../../../engine/pagination";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { SimpleSelect } from "../Select/Select";
import { TextInput } from "../TextInput/TextInput";
import { Tooltip } from "../Tooltip/Tooltip";
import "./Pagination.css";

export type PaginationProps = {
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Applies raw custom-size text; return false to reject (the input then reverts). */
  onCommitCustomPageSize?: (raw: string) => boolean;
  /** Noun for the range readout: "Showing 13–24 of 57 characters". */
  itemLabel?: string;
  /** Extra classes (e.g. a per-surface margin). */
  className?: string;
  ariaLabel?: string;
  /** Hide the "Per page" control (rare; both current callers show it). */
  showPageSize?: boolean;
};

/**
 * Shared library/collection pager — compact, token-driven pagination bar.
 * Pair with `usePagination()` or `useServerPagination()` for state.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  onCommitCustomPageSize,
  itemLabel,
  className = "",
  ariaLabel = "Pagination",
  showPageSize = true,
}: PaginationProps) {
  const totalPages = totalPagesFor(total, pageSize);
  const [customMode, setCustomMode] = useState<boolean>(
    () => !isPresetPageSize(pageSize),
  );
  const [draft, setDraft] = useState<string>(() =>
    isPresetPageSize(pageSize) ? "" : String(pageSize),
  );
  const [pageDraft, setPageDraft] = useState<string>(String(page));

  useEffect(() => {
    if (isPresetPageSize(pageSize)) return;
    setCustomMode(true);
    setDraft(String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  const { from, to, all } = rangeParts(page, pageSize, total);

  const progressLeft =
    total === 0 ? 0 : Math.max(0, ((from - 1) / total) * 100);
  const progressWidth =
    total === 0
      ? 0
      : Math.min(100 - progressLeft, ((to - from + 1) / total) * 100);

  function handleSelectChange(val: string) {
    if (val === "custom") {
      setCustomMode(true);
      setDraft((d) => (parsePageSizeInput(d) !== null ? d : String(pageSize)));
      return;
    }
    setCustomMode(false);
    setDraft("");
    if (val === ALL_PAGE_SIZE) {
      onPageSizeChange(ALL_PAGE_SIZE);
      return;
    }
    onPageSizeChange(Number(val));
  }

  function commitDraft() {
    if (!onCommitCustomPageSize) return;
    if (onCommitCustomPageSize(draft)) {
      setCustomMode(true);
      setDraft(String(parsePageSizeInput(draft) ?? pageSize));
    } else {
      setDraft(String(pageSize));
    }
  }

  function commitPageDraft() {
    const parsed = parseInt(pageDraft, 10);
    if (!isNaN(parsed)) {
      let next = parsed;
      if (next < 1) next = 1;
      if (next > totalPages) next = totalPages;
      onPageChange(next);
      setPageDraft(String(next));
    } else {
      setPageDraft(String(page));
    }
  }

  const classes = [
    "base-pagination",
    totalPages > 1 ? "base-pagination--with-progress" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={
        totalPages > 1
          ? ({
              "--pagination-progress-left": `${progressLeft}%`,
              "--pagination-progress-width": `${progressWidth}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {totalPages > 1 && (
        <div className="base-pagination__progress" aria-hidden="true">
          <div className="base-pagination__progress-fill" />
        </div>
      )}

      <div className="base-pagination__summary">
        {total === 0 ? (
          <span>
            Showing <strong>0</strong>
            {itemLabel ? ` ${itemLabel}` : ""}
          </span>
        ) : all ? (
          <span>
            Showing all <strong>{total}</strong>
            {itemLabel ? ` ${itemLabel}` : ""}
          </span>
        ) : (
          <span>
            Showing{" "}
            <strong>
              {from}–{to}
            </strong>{" "}
            of <strong>{total}</strong>
            {itemLabel ? ` ${itemLabel}` : ""}
          </span>
        )}
      </div>

      {totalPages > 1 ? (
        <nav className="base-pagination__controls" aria-label={ariaLabel}>
          <Tooltip content="First page">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="base-pagination__nav-btn"
              disabled={page === 1}
              onClick={() => onPageChange(1)}
              aria-label="First page"
            >
              <Icon name="ChevronsLeft" size={13} />
            </Button>
          </Tooltip>
          <Tooltip content="Previous page">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="base-pagination__nav-btn"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <Icon name="ChevronLeft" size={13} />
            </Button>
          </Tooltip>

          <div className="base-pagination__jumper">
            <span className="base-pagination__jumper-text">Page</span>
            <TextInput
              type="number"
              inputMode="numeric"
              size="sm"
              min={1}
              max={totalPages}
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={commitPageDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPageDraft();
              }}
              fullWidth={false}
              containerClassName="base-pagination__page-input"
              aria-label="Current page"
            />
            <span className="base-pagination__jumper-text">
              of {totalPages}
            </span>
          </div>

          <Tooltip content="Next page">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="base-pagination__nav-btn"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <Icon name="ChevronRight" size={13} />
            </Button>
          </Tooltip>
          <Tooltip content="Last page">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="base-pagination__nav-btn"
              disabled={page === totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Last page"
            >
              <Icon name="ChevronsRight" size={13} />
            </Button>
          </Tooltip>
        </nav>
      ) : null}

      {showPageSize ? (
        <div className="base-pagination__size">
          <span className="base-pagination__size-label">Per page:</span>
          <SimpleSelect<string>
            value={customMode ? "custom" : String(pageSize)}
            onChange={handleSelectChange}
            options={[
              ...PAGE_SIZE_PRESETS.map((n) => ({
                value: String(n),
                label: String(n),
              })),
              { value: ALL_PAGE_SIZE, label: "All" },
              { value: "custom", label: "Custom…" },
            ]}
            size="xs"
            aria-label="Items per page"
          />
          {customMode ? (
            <TextInput
              size="sm"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PAGE_SIZE}
              fullWidth={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
              }}
              placeholder="Count"
              containerClassName="base-pagination__custom-input"
              aria-label="Custom items per page"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
