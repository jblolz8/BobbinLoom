import type { ReactNode } from "react";

/** One row of the nav: what to select, and what to show. */
export type SideNavItem = {
  id: string;
  label: string;
  /** An optional trailing badge — a count, a mark. */
  meta?: ReactNode;
};

/** A labelled group of rows. */
export type SideNavSection = {
  label: string;
  items: SideNavItem[];
};

export type SideNavProps = {
  /** The element's id, so the consumer's toggle can carry `aria-controls` and `aria-expanded`. */
  id: string;
  ariaLabel: string;
  title?: ReactNode;
  sections?: SideNavSection[];
  activeId?: string;
  onSelect: (id: string) => void;
  /** Sits under the title, above the list (the docs viewer puts its search box here). */
  headerExtra?: ReactNode;
  /** Replaces the grouped list outright — the docs viewer swaps in its search results. */
  listOverride?: ReactNode;
  /** Wide screens: the column is collapsed away. */
  hidden?: boolean;
  /** Narrow screens: the drawer is out. */
  open?: boolean;
  /** Draw a scrim under the drawer (narrow + open only). */
  showScrim?: boolean;
  onScrimClick?: () => void;
  emptyLabel?: string;
};

/**
 * A sectioned list of things to switch between, in the two presentations this app uses:
 * a column beside the content on a wide screen, a drawer over it below 767px.
 *
 * It is deliberately ONE presentation per viewport with no middle tier, and the state that
 * chooses between them is the consumer's: this component is controlled (`hidden`, `open`), so a
 * surface decides when its nav is out and stays the only owner of that decision.
 *
 * Two rules this carries from the docs viewer's own history, which is why it is a component at
 * all rather than a second copy of the markup:
 *
 * - **The control that hides the nav must not live inside it.** The consumer renders the toggle
 *   in its toolbar — a toggle inside the region it hides is `display: none` the instant it works,
 *   and one inside a translated drawer is off-canvas, so it could be used exactly once.
 * - **A closed drawer is hidden with `visibility`, not only a `transform`.** The drawer is
 *   positioned inside a container that may carry its own offset, and a transform alone leaves a
 *   sliver of it on screen at that edge.
 *
 * The consumer's row container must be `position: relative` — the drawer positions against it.
 */
export function SideNav({
  id,
  ariaLabel,
  title,
  sections = [],
  activeId,
  onSelect,
  headerExtra,
  listOverride,
  hidden = false,
  open = false,
  showScrim = false,
  onScrimClick,
  emptyLabel = "Nothing to show yet."
}: SideNavProps) {
  const className = ["side-nav", hidden ? "is-hidden" : "", open ? "is-open" : ""].filter(Boolean).join(" ");

  return (
    <>
      <nav className={className} id={id} aria-label={ariaLabel} aria-hidden={hidden}>
        {title || headerExtra ? (
          <div className="side-nav-header">
            {title ? <span className="side-nav-title">{title}</span> : null}
          </div>
        ) : null}

        {headerExtra}

        {listOverride ?? (
          <div className="side-nav-list">
            {sections.map((section) => (
              <div className="side-nav-group" key={section.label}>
                <span className="side-nav-group-label">{section.label}</span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`side-nav-item ${item.id === activeId ? "active" : ""}`.trim()}
                    onClick={() => onSelect(item.id)}
                    aria-current={item.id === activeId ? "true" : undefined}
                  >
                    {item.meta ? (
                      <span className="side-nav-item-row">
                        <span className="side-nav-item-label">{item.label}</span>
                        <span className="side-nav-item-meta">{item.meta}</span>
                      </span>
                    ) : (
                      item.label
                    )}
                  </button>
                ))}
              </div>
            ))}
            {sections.every((section) => section.items.length === 0) ? (
              <p className="side-nav-empty">{emptyLabel}</p>
            ) : null}
          </div>
        )}
      </nav>

      {showScrim ? <div className="side-nav-scrim" onClick={onScrimClick} /> : null}
    </>
  );
}
