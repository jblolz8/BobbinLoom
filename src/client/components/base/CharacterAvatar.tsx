import { useEffect, useState } from "react";
import type { CharacterTemplate } from "../../../schemas";
import { getCharacterAvatarUrl } from "../../api";
import { displayTitle } from "../../../engine/characterCards";

export type CharacterAvatarVariant = "portrait" | "list" | "grid" | "chip" | "custom";

export type CharacterAvatarProps = {
  template: CharacterTemplate | (Pick<CharacterTemplate, "id"> & {
    name?: string;
    cardVersion?: number;
    version?: number;
    avatarUpdatedAt?: number;
    format?: string;
  });
  variant?: CharacterAvatarVariant;
  type?: "portrait" | "profile" | "original";
  className?: string;
  alt?: string;
  size?: number | string;
};

/**
 * Unified CharacterAvatar base component.
 * Supports semantic variants:
 * - "portrait": Full 2:3 portrait crop focused on character
 * - "list": 72x108 2:3 framed 1:1 profile thumbnail
 * - "grid": 1:1 square profile thumbnail
 * - "chip": 24x24 compact round avatar
 * - "custom": Custom user-styled container
 */
export function CharacterAvatar({
  template,
  variant = "portrait",
  type,
  className = "",
  alt,
  size,
}: CharacterAvatarProps) {
  const [failed, setFailed] = useState(false);

  // Determine avatar type based on variant if not explicitly provided
  const effectiveType: "portrait" | "profile" | "original" =
    type ?? (variant === "portrait" ? "portrait" : "profile");

  // Determine standard class based on variant
  let variantClass = "";
  if (variant === "portrait") {
    variantClass = "card-portrait-avatar";
  } else if (variant === "list") {
    variantClass = "card-list-avatar";
  } else if (variant === "grid") {
    variantClass = "card-grid-thumb";
  } else if (variant === "chip") {
    variantClass = "selected-cast-avatar";
  }

  const combinedClass = [variantClass, className].filter(Boolean).join(" ");
  const fallbackLetter = displayTitle(template as CharacterTemplate).charAt(0).toUpperCase() || "?";

  // Reset fallback if template or avatar timestamp changes
  useEffect(() => {
    setFailed(false);
  }, [template.id, template.avatarUpdatedAt, effectiveType]);

  const style = size !== undefined ? { width: size, height: size } : undefined;

  if (failed) {
    return (
      <div
        className={`avatar-placeholder ${combinedClass}`}
        style={style}
        aria-label={alt ?? displayTitle(template as CharacterTemplate)}
      >
        {fallbackLetter}
      </div>
    );
  }

  return (
    <img
      className={`library-avatar ${combinedClass}`}
      src={getCharacterAvatarUrl(template.id, effectiveType, template.avatarUpdatedAt)}
      alt={alt ?? displayTitle(template as CharacterTemplate)}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
