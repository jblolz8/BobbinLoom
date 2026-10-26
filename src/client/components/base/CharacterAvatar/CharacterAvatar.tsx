import { useEffect, useState } from "react";
import type { CharacterTemplate } from "../../../../schemas";
import { getCharacterAvatarUrl, getPersonaAvatarUrl } from "../../../api";
import { displayTitle } from "../../../../engine/characterCards";
import "./CharacterAvatar.css";

export type CharacterAvatarVariant =
  | "portrait"
  | "list"
  | "grid"
  | "chip"
  | "cover-tile"
  | "custom";

export type CharacterAvatarProps = {
  template?:
    | CharacterTemplate
    | (Pick<CharacterTemplate, "id"> & {
        name?: string;
        cardVersion?: number;
        version?: number;
        avatarUpdatedAt?: number;
        format?: string;
      });
  persona?: {
    id: string;
    name?: string;
    avatarUpdatedAt?: number;
  };
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
 * - "cover-tile": one tile of a cast collage cover — fills its cell, no frame of its own
 * - "custom": Custom user-styled container
 */
export function CharacterAvatar({
  template,
  persona,
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
  } else if (variant === "cover-tile") {
    variantClass = "cover-art-tile-img";
  } else if (variant === "chip") {
    variantClass = "selected-cast-avatar";
  }

  const combinedClass = [variantClass, className].filter(Boolean).join(" ");
  const displayName = persona
    ? persona.name || "Persona"
    : template
      ? displayTitle(template as CharacterTemplate)
      : "?";
  const fallbackLetter = displayName.charAt(0).toUpperCase() || "?";
  const entityId = persona?.id ?? template?.id ?? "";
  const entityUpdatedAt = persona?.avatarUpdatedAt ?? template?.avatarUpdatedAt;

  // Reset fallback if template/persona or avatar timestamp changes
  useEffect(() => {
    setFailed(false);
  }, [entityId, entityUpdatedAt, effectiveType]);

  const style = size !== undefined ? { width: size, height: size } : undefined;

  if (failed || (!persona && !template)) {
    return (
      <div
        className={`avatar-placeholder ${combinedClass}`}
        style={style}
        aria-label={alt ?? displayName}
      >
        {fallbackLetter}
      </div>
    );
  }

  const src = persona
    ? getPersonaAvatarUrl(
        persona.id,
        effectiveType === "original" ? "portrait" : effectiveType,
        persona.avatarUpdatedAt,
      )
    : getCharacterAvatarUrl(
        template!.id,
        effectiveType,
        template!.avatarUpdatedAt,
      );

  return (
    <img
      className={`library-avatar ${combinedClass}`}
      src={src}
      alt={alt ?? displayName}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
