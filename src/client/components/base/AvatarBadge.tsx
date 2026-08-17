import React, { useState } from "react";
import type { AvatarShape } from "../../../schemas";
import { Icon, type IconName } from "./Icon";

export type AvatarBadgeSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

export type AvatarBadgeProps = {
  src?: string;
  name?: string;
  icon?: IconName;
  size?: AvatarBadgeSize;
  shape?: AvatarShape | "global";
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  alt?: string;
};

function resolveSizePx(size: AvatarBadgeSize = "md"): number {
  if (typeof size === "number") return size;
  switch (size) {
    case "xs":
      return 24;
    case "sm":
      return 30;
    case "md":
      return 36;
    case "lg":
      return 44;
    case "xl":
      return 60;
    default:
      return 36;
  }
}

export function AvatarBadge({
  src,
  name,
  icon,
  size = "md",
  shape = "global",
  className = "",
  onClick,
  title,
  alt,
}: AvatarBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizePx = resolveSizePx(size);

  const initialLetter = name ? name.trim().charAt(0).toUpperCase() : null;
  const isInteractive = typeof onClick === "function";

  const shapeClass = shape === "global" ? "avatar-shape-global" : `avatar-shape-${shape}`;
  const sizeClass = typeof size === "string" ? `avatar-size-${size}` : "";

  return (
    <div
      className={`avatar-badge ${shapeClass} ${sizeClass} ${isInteractive ? "is-clickable" : ""} ${className}`.trim()}
      style={{
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        minWidth: `${sizePx}px`,
        minHeight: `${sizePx}px`,
      }}
      onClick={onClick}
      title={title ?? name}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {src && !imgFailed ? (
        <img
          src={src}
          alt={alt ?? name ?? "avatar"}
          className="avatar-badge-img"
          onError={() => setImgFailed(true)}
        />
      ) : icon ? (
        <div className="avatar-badge-fallback is-icon">
          <Icon name={icon} size={Math.max(12, Math.round(sizePx * 0.52))} />
        </div>
      ) : initialLetter ? (
        <div className="avatar-badge-fallback is-letter" style={{ fontSize: `${Math.max(10, Math.round(sizePx * 0.44))}px` }}>
          {initialLetter}
        </div>
      ) : (
        <div className="avatar-badge-fallback is-icon">
          <Icon name="User" size={Math.max(12, Math.round(sizePx * 0.52))} />
        </div>
      )}
    </div>
  );
}
