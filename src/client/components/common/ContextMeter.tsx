import { useEffect, useRef, useState } from "react";
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

interface TooltipState {
  key: string;
  label: string;
  value: number;
  segPct: number;
  top: number;
  left: number;
}

export function ContextMeter({ tokenUsage }: { tokenUsage: TokenUsage | null }) {
  const meterRef = useRef<HTMLDivElement>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<TooltipState | null>(null);
  const [pinnedTooltip, setPinnedTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!pinnedTooltip) return;
    function handleClickOutside(e: MouseEvent) {
      if (meterRef.current && !meterRef.current.contains(e.target as Node)) {
        setPinnedTooltip(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pinnedTooltip]);

  if (!tokenUsage) {
    return (
      <div className="context-meter empty">
        <span className="context-meter-label">Context usage unavailable</span>
      </div>
    );
  }

  const { estimated, contextWindow, breakdown } = tokenUsage;
  const pct = Math.min(100, Math.round((estimated / contextWindow) * 100));
  const remaining = Math.max(0, contextWindow - estimated);
  const remainingPct = Math.max(0, 100 - pct);

  const statusClass = pct >= 95 ? "status-danger" : pct >= 85 ? "status-warning" : "status-normal";

  const buildTooltip = (
    e: React.MouseEvent<HTMLDivElement>,
    key: string,
    label: string,
    value: number,
    segPct: number
  ): TooltipState => {
    const segRect = e.currentTarget.getBoundingClientRect();
    return {
      key,
      label,
      value,
      segPct,
      top: segRect.top,
      left: segRect.left + segRect.width / 2,
    };
  };

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    key: string,
    label: string,
    value: number,
    segPct: number
  ) => {
    setHoveredTooltip(buildTooltip(e, key, label, value, segPct));
  };

  const handleMouseLeave = () => {
    setHoveredTooltip(null);
  };

  const handleClick = (
    e: React.MouseEvent<HTMLDivElement>,
    key: string,
    label: string,
    value: number,
    segPct: number
  ) => {
    const t = buildTooltip(e, key, label, value, segPct);
    setPinnedTooltip((prev) => (prev?.key === key ? null : t));
  };

  const activeTooltip = hoveredTooltip ?? pinnedTooltip;

  return (
    <div className="context-meter" ref={meterRef}>
      <div className="context-meter-bar">
        {SEGMENTS.map(({ key, label, color }) => {
          const value = breakdown[key] ?? 0;
          if (value <= 0) return null;
          const widthPct = (value / contextWindow) * 100;
          const segPct = Math.round((value / estimated) * 100);
          const isPinned = pinnedTooltip?.key === key;
          return (
            <div
              key={key}
              className={`context-meter-segment${isPinned ? " is-pinned" : ""}`}
              style={{ width: `${widthPct}%`, backgroundColor: color }}
              onMouseEnter={(e) => handleMouseEnter(e, key, label, value, segPct)}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => handleClick(e, key, label, value, segPct)}
            />
          );
        })}
        {remaining > 0 ? (
          <div
            className={`context-meter-segment free-space${pinnedTooltip?.key === "freeSpace" ? " is-pinned" : ""}`}
            style={{ width: `${(remaining / contextWindow) * 100}%`, backgroundColor: "rgba(255, 255, 255, 0.08)" }}
            onMouseEnter={(e) => handleMouseEnter(e, "freeSpace", "Free Space", remaining, remainingPct)}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => handleClick(e, "freeSpace", "Free Space", remaining, remainingPct)}
          />
        ) : null}
      </div>
      {activeTooltip && (
        <div
          className="context-meter-tooltip"
          style={{ top: `${activeTooltip.top}px`, left: `${activeTooltip.left}px` }}
        >
          {activeTooltip.label}: {formatTokens(activeTooltip.value)} tokens ({activeTooltip.segPct}%)
          <div className="context-meter-tooltip-caret" />
        </div>
      )}
      <span className={`context-meter-label ${statusClass}`}>
        {formatTokens(estimated)}/{formatTokens(contextWindow)} tokens ({pct}%)
        {remaining > 0 ? ` · ${formatTokens(remaining)} remaining` : " · full"}
      </span>
    </div>
  );
}

