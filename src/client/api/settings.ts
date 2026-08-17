import type { AvatarShape, TagTaxonomyConfig } from "../../schemas";
import { request } from "./client";

export function getTagTaxonomy(): Promise<{ tagTaxonomy: TagTaxonomyConfig }> {
  return request<{ tagTaxonomy: TagTaxonomyConfig }>("/api/settings/tag-taxonomy");
}

export function updateTagTaxonomy(config: TagTaxonomyConfig): Promise<{ tagTaxonomy: TagTaxonomyConfig }> {
  return request<{ tagTaxonomy: TagTaxonomyConfig }>("/api/settings/tag-taxonomy", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function getAppearanceSettings(): Promise<{ avatarShape: AvatarShape }> {
  return request<{ avatarShape: AvatarShape }>("/api/settings/appearance");
}

export function updateAppearanceSettings(payload: { avatarShape: AvatarShape }): Promise<{ avatarShape: AvatarShape }> {
  return request<{ avatarShape: AvatarShape }>("/api/settings/appearance", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Applies CSS variables and attributes globally to document.documentElement */
export function applyAvatarShapeTheme(shape: AvatarShape) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-avatar-shape", shape);
  const radius = shape === "circle" ? "50%" : shape === "square" ? "2px" : "8px";
  document.documentElement.style.setProperty("--avatar-badge-radius", radius);
  try {
    localStorage.setItem("bobbinloom_avatar_shape", shape);
  } catch {
    /* silent */
  }
}
