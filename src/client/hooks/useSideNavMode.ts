import { useCallback, useEffect, useState } from "react";

/** Where a side nav stops being a column and becomes a drawer. One breakpoint, one tier. */
export const SIDE_NAV_DRAWER_QUERY = "(max-width: 767px)";
export const SIDE_NAV_DRAWER_MAX_WIDTH = 767;

export type UseSideNavModeOptions = {
  /**
   * When true (default for workspace pages), also treats the active `.base-page-shell__section`
   * workspace container being `<= 767px` wide as narrow mode so narrow Workspace Width settings
   * (e.g. 50% on a half-screen window) switch into the drawer view automatically.
   */
  respectWorkspaceWidth?: boolean;
};

/**
 * The state a `SideNav` is controlled by, in one place so two surfaces cannot drift apart: on a
 * wide screen the column is collapsible, below the breakpoint the same control opens a drawer over
 * the content. Crossing the breakpoint resets the state that no longer applies, so a drawer left
 * open on a phone does not become a collapsed column when the window grows.
 */
export function useSideNavMode(options?: UseSideNavModeOptions) {
  const respectWorkspaceWidth = options?.respectWorkspaceWidth ?? false;
  const [narrow, setNarrow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia(SIDE_NAV_DRAWER_QUERY);
    const workspaceEl =
      respectWorkspaceWidth && typeof document !== "undefined"
        ? document.querySelector<HTMLElement>(".base-page-shell__section")
        : null;

    const computeIsNarrow = () => {
      if (media.matches) return true;
      if (workspaceEl && workspaceEl.clientWidth > 0) {
        return workspaceEl.clientWidth <= SIDE_NAV_DRAWER_MAX_WIDTH;
      }
      return false;
    };

    let prevNarrow: boolean | null = null;
    const sync = () => {
      const nextNarrow = computeIsNarrow();
      setNarrow(nextNarrow);
      if (prevNarrow === null || prevNarrow !== nextNarrow) {
        if (!nextNarrow) setDrawerOpen(false);
        else setCollapsed(false);
        prevNarrow = nextNarrow;
      }
    };
    sync();
    media.addEventListener("change", sync);

    let ro: ResizeObserver | null = null;
    if (workspaceEl && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(workspaceEl);
    }

    return () => {
      media.removeEventListener("change", sync);
      ro?.disconnect();
    };
  }, [respectWorkspaceWidth]);

  // Stable identities: a consumer may hold these in an effect's dependency list (the docs
  // viewer's Escape handler does), and a fresh function every render would re-subscribe it.
  const toggle = useCallback(() => {
    if (narrow) setDrawerOpen((open) => !open);
    else setCollapsed((value) => !value);
  }, [narrow]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const collapse = useCallback(() => setCollapsed(true), []);

  return {
    narrow,
    drawerOpen,
    setDrawerOpen,
    collapsed,
    /** The nav is visible at all — what the toggle's pressed state and the toolbar's icon read. */
    shown: narrow ? drawerOpen : !collapsed,
    toggle,
    closeDrawer,
    collapse,
  };
}
