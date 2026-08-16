import type { TagTaxonomyConfig } from "../../schemas";
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
