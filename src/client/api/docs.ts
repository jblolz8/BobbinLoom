import { request } from "./client";

/** One entry in the docs nav. `order` is `null` for a page without front-matter
 *  order — the server sorts those to the end. */
export type DocPageMeta = {
  slug: string;
  title: string;
  section: string;
  order: number | null;
};

export type DocPage = DocPageMeta & { markdown: string };

export function listDocs(): Promise<DocPageMeta[]> {
  return request<{ pages: DocPageMeta[] }>("/api/docs").then((res) => res.pages);
}

export function getDoc(slug: string): Promise<DocPage> {
  return request<DocPage>(`/api/docs/${encodeURIComponent(slug)}`);
}
/** A search hit's context: the heading it sits under (its anchor is the id
 *  the renderer writes for that heading) and one collapsed line around it. */
export type DocSearchHit = { anchor: string | null; heading: string | null; snippet: string };

export type DocSearchPage = {
  slug: string;
  title: string;
  section: string;
  /** Body hits on the page. A title-only match reports zero. */
  count: number;
  titleMatch: boolean;
  hits: DocSearchHit[];
};

export type DocSearchResult = { query: string; total: number; pages: DocSearchPage[] };

/** Exact-phrase, case-insensitive search across every page's body. Queries
 *  shorter than two characters come back empty rather than matching the app. */
export function searchDocs(query: string): Promise<DocSearchResult> {
  return request<DocSearchResult>(`/api/docs/search?q=${encodeURIComponent(query)}`);
}
