import {
  forwardRef,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Button } from "../Button/Button";
import { Icon, type IconName } from "../Icon";

export type StatusMessageVariant = "inline" | "banner";
export type StatusMessageTone = "neutral" | "ok" | "warn" | "err";

export interface StatusMessageProps extends HTMLAttributes<HTMLDivElement> {
  variant?: StatusMessageVariant;
  tone?: StatusMessageTone;
  /** Override the default tone icon, or pass `false` to hide the icon. */
  icon?: IconName | ReactNode | false;
  /** Spinning loader icon for in-flight inline/banner statuses. */
  loading?: boolean;
  /** Optional expandable detail string (rendered in a `<pre>` disclosure). */
  detail?: string;
  /** When true and `children` is a multi-line or >96-char string, automatically truncates the summary and moves the full text into `detail`. */
  autoCollapseDetail?: boolean;
  onDismiss?: () => void;
  children?: ReactNode;
}

const DEFAULT_ICON_BY_TONE: Record<StatusMessageTone, IconName> = {
  neutral: "Info",
  ok: "CheckCircle2",
  warn: "AlertTriangle",
  err: "AlertCircle",
};

function resolveStatusSummary(
  children: ReactNode,
  detail: string | undefined,
  autoCollapseDetail: boolean
): { summary: ReactNode; resolvedDetail?: string; isCompact: boolean } {
  if (detail) {
    return { summary: children, resolvedDetail: detail, isCompact: true };
  }
  if (autoCollapseDetail && typeof children === "string") {
    const trimmed = children.trim();
    if (trimmed.length <= 96 && !trimmed.includes("\n")) {
      return { summary: trimmed, isCompact: true };
    }
    const firstLine = trimmed.split("\n")[0].trim();
    const summary = firstLine.length > 96 ? `${firstLine.slice(0, 93)}…` : firstLine;
    return { summary, resolvedDetail: trimmed, isCompact: true };
  }
  return { summary: children, isCompact: false };
}

export const StatusMessage = forwardRef<HTMLDivElement, StatusMessageProps>(
  function StatusMessage(
    {
      variant = "banner",
      tone = "neutral",
      icon,
      loading = false,
      detail,
      autoCollapseDetail = false,
      onDismiss,
      className = "",
      children,
      ...props
    },
    ref
  ) {
    const [expandedDetail, setExpandedDetail] = useState(false);

    useEffect(() => {
      setExpandedDetail(false);
    }, [children, detail, tone]);

    const { summary, resolvedDetail, isCompact } = resolveStatusSummary(
      children,
      detail,
      autoCollapseDetail
    );

    const iconSize = variant === "inline" ? 12 : 13;
    const resolvedIconName: IconName | ReactNode | false =
      icon !== undefined ? icon : loading ? "Loader2" : DEFAULT_ICON_BY_TONE[tone];

    const iconElement =
      resolvedIconName === false ? null : typeof resolvedIconName === "string" ? (
        <span
          className={[
            "base-status__icon",
            loading ? "base-status__icon--spin" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Icon name={resolvedIconName} size={iconSize} />
        </span>
      ) : (
        <span className="base-status__icon">{resolvedIconName}</span>
      );

    const classNames = [
      "base-status",
      `base-status--${variant}`,
      `base-status--${tone}`,
      isCompact || Boolean(onDismiss) ? "base-status--compact" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    if (variant === "inline") {
      return (
        <div ref={ref} role="status" aria-live="polite" className={classNames} {...props}>
          {iconElement}
          <span>{summary}</span>
        </div>
      );
    }

    return (
      <div ref={ref} role="status" aria-live="polite" className={classNames} {...props}>
        <div className="base-status__main">
          {iconElement}
          <div className="base-status__text">{summary}</div>
          {resolvedDetail && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setExpandedDetail((v) => !v)}
            >
              {expandedDetail ? "Hide" : "Details"}
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              leftIcon="X"
              onClick={onDismiss}
              aria-label="Dismiss status"
              title="Dismiss"
            />
          )}
        </div>
        {resolvedDetail && expandedDetail && (
          <pre className="base-status__detail">{resolvedDetail}</pre>
        )}
      </div>
    );
  }
);

export default StatusMessage;
