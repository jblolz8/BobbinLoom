import { useMemo } from "react";
import { resolveTagStyle, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

export type TagChipProps = {
  tag: string;
  userConfig?: TagTaxonomyConfig | null;
  active?: boolean;
  count?: number;
  onClick?: (e: React.MouseEvent) => void;
  onRemove?: () => void;
  disabled?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  title?: string;
  showCategoryTooltip?: boolean;
};

export function TagChip({
  tag,
  userConfig,
  active,
  count,
  onClick,
  onRemove,
  disabled,
  size = "md",
  className = "",
  title,
  showCategoryTooltip = true,
}: TagChipProps) {
  const style = useMemo(() => resolveTagStyle(tag, userConfig), [tag, userConfig]);

  const defaultTitle = useMemo(() => {
    if (title) return title;
    if (!showCategoryTooltip) return tag;
    return `[${style.categoryLabel}] ${tag}${count !== undefined ? ` (${count})` : ""}`;
  }, [title, showCategoryTooltip, style.categoryLabel, tag, count]);

  const isInteractive = Boolean(onClick) && !disabled;

  const elementProps = {
    className: `color-tag-chip size-${size} cat-${style.categoryId} ${active ? "active" : ""} ${isInteractive ? "interactive" : ""} ${className}`,
    style: {
      backgroundColor: active ? (style.colors.glow || style.colors.bg) : style.colors.bg,
      borderColor: active ? style.colors.text : style.colors.border,
      color: style.colors.text,
      boxShadow: active ? `0 0 8px ${style.colors.glow || style.colors.border}` : undefined,
    },
    title: defaultTitle,
    onClick: isInteractive ? onClick : undefined,
  };

  const content = (
    <>
      {style.namespace ? (
        <span className="tag-namespace-prefix">{style.namespace}:</span>
      ) : null}
      <span className="tag-value-text">{style.value || style.displayLabel}</span>
      {count !== undefined ? (
        <span className="tag-count-indicator" style={{ borderColor: style.colors.border }}>
          {count}
        </span>
      ) : null}
      {onRemove && !disabled ? (
        <button
          type="button"
          className="tag-remove-action"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={`Remove tag "${tag}"`}
          aria-label={`Remove tag "${tag}"`}
        >
          ✕
        </button>
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <button type="button" {...elementProps}>
        {content}
      </button>
    );
  }

  return (
    <span {...elementProps}>
      {content}
    </span>
  );
}
