import { useState } from "react";
import {
  ALL_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
  getPageNumbers,
  isPresetPageSize,
  parsePageSizeInput,
  rangeParts,
  totalPagesFor,
  type PageSize
} from "../../engine/pagination";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { SimpleSelect } from "./Select";
import { TextInput } from "./TextInput";
import { Tooltip } from "./Tooltip";

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
 * Shared library/collection pager — the design-system replacement for the copy that lived in
 * CharacterLibrary and its fork in SetupView. Pair with `usePagination()` for state.
 *
 * The root renders `.base-pagination`; the inner `pagination-*` class names are kept because the
 * moved stylesheet block (components.css) still targets them.
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
  showPageSize = true
}: PaginationProps) {
  const totalPages = totalPagesFor(total, pageSize);
  // `customMode` is explicit state: deriving it from `pageSize` meant selecting "Custom…" while a
  // preset was active did nothing (the input never appeared). It initialises from storage so a
  // persisted custom size still shows the input.
  const [customMode, setCustomMode] = useState<boolean>(() => !isPresetPageSize(pageSize));
  const [draft, setDraft] = useState<string>(() => (isPresetPageSize(pageSize) ? "" : String(pageSize)));
  const { from, to, all } = rangeParts(page, pageSize, total);

  function handleSelectChange(val: string) {
    if (val === "custom") {
      setCustomMode(true);
      // Prefill with the currently applied size so the user edits from a sane starting point.
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

  return (
    <div className={`base-pagination ${className}`.trim()}>
      <div className="pagination-info">
        {total === 0 ? (
          <>Showing <strong>0</strong>{itemLabel ? ` ${itemLabel}` : ""}</>
        ) : all ? (
          <>Showing all <strong>{total}</strong>{itemLabel ? ` ${itemLabel}` : ""}</>
        ) : (
          <>Showing <strong>{from}–{to}</strong> of <strong>{total}</strong>{itemLabel ? ` ${itemLabel}` : ""}</>
        )}
      </div>

      {totalPages > 1 ? (
        <nav className="pagination-controls" aria-label={ariaLabel}>
          <Tooltip content="First page">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              iconOnly
              className="pagination-nav-btn"
              disabled={page === 1}
              onClick={() => onPageChange(1)}
              aria-label="First page"
            >
              <Icon name="ChevronsLeft" size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Previous page">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              iconOnly
              className="pagination-nav-btn"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <Icon name="ChevronLeft" size={14} />
            </Button>
          </Tooltip>

          {getPageNumbers(page, totalPages).map((p, idx) => {
            if (p === -1) {
              return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>;
            }
            const active = page === p;
            return (
              <Button
                key={p}
                type="button"
                variant={active ? "primary" : "secondary"}
                size="xs"
                className={`pagination-page-btn ${active ? "active" : ""}`}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={active ? "page" : undefined}
              >
                {p}
              </Button>
            );
          })}

          <Tooltip content="Next page">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              iconOnly
              className="pagination-nav-btn"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <Icon name="ChevronRight" size={14} />
            </Button>
          </Tooltip>
          <Tooltip content="Last page">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              iconOnly
              className="pagination-nav-btn"
              disabled={page === totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Last page"
            >
              <Icon name="ChevronsRight" size={14} />
            </Button>
          </Tooltip>
        </nav>
      ) : null}

      {showPageSize ? (
        <div className="pagination-size-selector">
          <span className="pagination-size-selector-label">Per page:</span>
          <SimpleSelect<string>
            value={customMode ? "custom" : String(pageSize)}
            onChange={handleSelectChange}
            options={[
              ...PAGE_SIZE_PRESETS.map((n) => ({ value: String(n), label: String(n) })),
              { value: ALL_PAGE_SIZE, label: "All" },
              { value: "custom", label: "Custom…" }
            ]}
            size="xs"
            aria-label="Items per page"
          />
          {customMode ? (
            <TextInput
              size="sm"
              type="number"
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
              containerClassName="pagination-custom-input"
              aria-label="Custom items per page"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
