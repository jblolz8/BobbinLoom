import { useEffect, useRef, useState } from "react";

export type MobileTab = "scene" | "chat" | "info";

export function useResponsive(breakpointPx: number = 1100) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${breakpointPx}px)`).matches);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [breakpointPx]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreMenuOpen]);

  return {
    isMobile,
    mobileTab,
    setMobileTab,
    moreMenuOpen,
    setMoreMenuOpen,
    moreMenuRef
  };
}
