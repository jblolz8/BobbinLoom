import { useCallback, useEffect, useState } from "react";

/** Where a side nav stops being a column and becomes a drawer. One breakpoint, one tier. */
export const SIDE_NAV_DRAWER_QUERY = "(max-width: 767px)";

/**
 * The state a `SideNav` is controlled by, in one place so two surfaces cannot drift apart: on a
 * wide screen the column is collapsible, below the breakpoint the same control opens a drawer over
 * the content. Crossing the breakpoint resets the state that no longer applies, so a drawer left
 * open on a phone does not become a collapsed column when the window grows.
 */
export function useSideNavMode() {
  const [narrow, setNarrow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(SIDE_NAV_DRAWER_QUERY);
    const sync = () => {
      setNarrow(media.matches);
      if (!media.matches) setDrawerOpen(false);
      else setCollapsed(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
    collapse
  };
}
