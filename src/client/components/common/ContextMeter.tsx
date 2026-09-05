import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TokenUsage } from "../../api";

const SEGMENTS: Array<{ key: keyof TokenUsage["breakdown"]; label: string; color: string }> = [
  { key: "modules", label: "Modules", color: "#4a90d9" },
  { key: "outputFormat", label: "Output Format", color: "#6b7280" },
  { key: "lorebook", label: "Lorebook", color: "#8b5cf6" },
  { key: "storySoFar", label: "Story So Far", color: "#2dd4bf" },
  { key: "stateSummary", label: "State Summary", color: "#10b981" },
  { key: "recentMessages", label: "Chat History", color: "#f59e0b" },
  { key: "memoryEvents", label: "Memory Events", color: "#ef4444" },
  { key: "lorebookDepth", label: "Lorebook Depth", color: "#a78bfa" },
  { key: "userInput", label: "User Input", color: "#06b6d4" },
];

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatPct(n: number): string {
  if (n <= 0) return "0%";
  if (n < 0.1) return "<0.1%";
  return `${n.toFixed(1)}%`;
}

interface ActiveSegment {
  key: string;
  label: string;
  value: number;
  segPct: string;
  centerX: number;
  topY: number;
}

export function ContextMeter({ tokenUsage }: { tokenUsage: TokenUsage | null }) {
  const meterRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [clampedPos, setClampedPos] = useState<{ left: number; arrowOffset: number } | null>(null);

  // Synchronously clamp tooltip position to prevent viewport bleeding (especially on far-left)
  useLayoutEffect(() => {
    if (!activeSegment) {
      setClampedPos(null);
      return;
    }

    const width = tooltipRef.current?.getBoundingClientRect().width || 170;
    const halfWidth = width / 2;
    const padding = 12; // Minimum distance from screen edges

    const minCenterX = padding + halfWidth;
    const maxCenterX = window.innerWidth - padding - halfWidth;
    const clampedCenterX = Math.max(minCenterX, Math.min(activeSegment.centerX, maxCenterX));

    // Calculate how much the arrow needs to shift from the tooltip center to align with the segment center
    const rawArrowOffset = activeSegment.centerX - clampedCenterX;
    const maxArrowOffset = halfWidth - 10;
    const arrowOffset = Math.max(-maxArrowOffset, Math.min(rawArrowOffset, maxArrowOffset));

    setClampedPos({
      left: clampedCenterX,
      arrowOffset,
    });
  }, [activeSegment]);

  // Handle outside pointerdown/tap to dismiss when pinned
  useEffect(() => {
    if (!isPinned) return;

    function handlePointerDownOutside(e: PointerEvent | MouseEvent) {
      if (
        meterRef.current &&
        !meterRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsPinned(false);
        setActiveSegment(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
    };
  }, [isPinned]);

  const handleSegmentHover = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      key: string,
      label: string,
      value: number,
      segPct: string
    ) => {
      // Only scrub on hover if not actively pinned
      if (isPinned) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const topY = rect.top - 7;
      setActiveSegment({ key, label, value, segPct, centerX, topY });
    },
    [isPinned]
  );

  const handleSegmentClick = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      key: string,
      label: string,
      value: number,
      segPct: string
    ) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const topY = rect.top - 7;

      // If already pinned on this exact segment, tap/click toggles it closed
      if (isPinned && activeSegment?.key === key) {
        setIsPinned(false);
        setActiveSegment(null);
      } else {
        setActiveSegment({ key, label, value, segPct, centerX, topY });
        setIsPinned(true);
      }
    },
    [isPinned, activeSegment]
  );

  const handleBarLeave = useCallback(() => {
    // Desktop: dismiss when hovering away, unless pinned
    if (!isPinned) {
      setActiveSegment(null);
    }
  }, [isPinned]);

  if (!tokenUsage) {
    return (
      <div className="context-meter empty">
        <span className="context-meter-label">Context usage unavailable</span>
      </div>
    );
  }

  const { estimated, contextWindow, breakdown } = tokenUsage;
  const pct = Math.min(100, (estimated / contextWindow) * 100);
  const remaining = Math.max(0, contextWindow - estimated);
  const remainingPct = Math.max(0, 100 - pct);

  const statusClass = pct >= 95 ? "status-danger" : pct >= 85 ? "status-warning" : "status-normal";

  return (
    <div className="context-meter" ref={meterRef}>
      <div className="context-meter-bar" onPointerLeave={handleBarLeave}>
        {SEGMENTS.map(({ key, label, color }) => {
          const value = breakdown[key] ?? 0;
          if (value <= 0) return null;
          const widthPct = (value / contextWindow) * 100;
          const segPct = formatPct(widthPct);
          const isSelected = activeSegment?.key === key;

          return (
            <div
              key={key}
              className={`context-meter-segment${isSelected ? " is-hovered" : ""}${isPinned && isSelected ? " is-pinned" : ""}`}
              style={{ width: `${widthPct}%`, backgroundColor: color }}
              onPointerEnter={(e) => handleSegmentHover(e, key, label, value, segPct)}
              onPointerMove={(e) => handleSegmentHover(e, key, label, value, segPct)}
              onClick={(e) => handleSegmentClick(e, key, label, value, segPct)}
            />
          );
        })}
        {remaining > 0 ? (
          <div
            className={`context-meter-segment free-space${activeSegment?.key === "freeSpace" ? " is-hovered" : ""}${isPinned && activeSegment?.key === "freeSpace" ? " is-pinned" : ""}`}
            style={{ width: `${(remaining / contextWindow) * 100}%` }}
            onPointerEnter={(e) => handleSegmentHover(e, "freeSpace", "Free Space", remaining, formatPct(remainingPct))}
            onPointerMove={(e) => handleSegmentHover(e, "freeSpace", "Free Space", remaining, formatPct(remainingPct))}
            onClick={(e) => handleSegmentClick(e, "freeSpace", "Free Space", remaining, formatPct(remainingPct))}
          />
        ) : null}
      </div>

      {typeof document !== "undefined" && activeSegment &&
        createPortal(
          <div
            ref={tooltipRef}
            className="base-tooltip-content context-meter-portal-tooltip"
            style={{
              position: "fixed",
              left: `${clampedPos?.left ?? activeSegment.centerX}px`,
              top: `${activeSegment.topY}px`,
              transform: "translate(-50%, -100%)",
              visibility: clampedPos ? "visible" : "hidden",
              pointerEvents: "none",
              zIndex: 99999,
            }}
          >
            {activeSegment.label}: {formatTokens(activeSegment.value)} tokens ({activeSegment.segPct} of context)
            <svg
              className="base-tooltip-arrow context-meter-portal-arrow"
              width={8}
              height={4}
              viewBox="0 0 8 4"
              style={{
                position: "absolute",
                top: "100%",
                left: `calc(50% + ${clampedPos?.arrowOffset ?? 0}px)`,
                transform: "translateX(-50%)",
              }}
            >
              <polygon points="0,0 4,4 8,0" />
            </svg>
          </div>,
          document.body
        )}

      <span className={`context-meter-label ${statusClass}`}>
        {formatTokens(estimated)}/{formatTokens(contextWindow)} tokens ({formatPct(pct)} of context)
        {remaining > 0 ? ` · ${formatTokens(remaining)} remaining` : " · full"}
      </span>
    </div>
  );
}

export default ContextMeter;
