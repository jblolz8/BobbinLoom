/** The docs search core: pure functions with no fs and no Fastify, so the
 *  behaviour that matters is testable without a server.
 *
 *  Semantics are deliberately plain — exact phrase, case-insensitive, literal
 *  (never a regex), non-overlapping — because the same query drives the
 *  highlight, and the reader has to be able to predict what gets marked. */
import { nearestHeading } from "./docsHeadings";

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;
export const MAX_HITS_PER_PAGE = 3;
const SNIPPET_RADIUS = 70;

export type SearchablePage = { slug: string; title: string; section: string; body: string };
export type DocHit = { anchor: string | null; heading: string | null; snippet: string };
export type PageHits = {
  slug: string;
  title: string;
  section: string;
  count: number;
  titleMatch: boolean;
  hits: DocHit[];
};

/** Non-overlapping, case-insensitive occurrences of a literal phrase. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  const pin = needle.toLowerCase();
  let count = 0;
  let from = hay.indexOf(pin);
  while (from !== -1) {
    count += 1;
    from = hay.indexOf(pin, from + pin.length);
  }
  return count;
}

/** A one-line window around a hit, whitespace collapsed, clipped edges marked. */
export function snippetAround(body: string, index: number, length: number, radius = SNIPPET_RADIUS): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + length + radius);
  const text = body.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${text}${end < body.length ? "…" : ""}`;
}

/** One page's hits in document order, capped; `count` is always the full total.
 *  A page whose title or section matches is reported even with no body hits, so
 *  searching a page's name still lists it. */
export function searchPage(page: SearchablePage, query: string, options: { maxHits?: number } = {}): PageHits {
  const maxHits = options.maxHits ?? MAX_HITS_PER_PAGE;
  const pin = query.toLowerCase();
  const hay = page.body.toLowerCase();
  const hits: DocHit[] = [];

  if (pin) {
    let from = hay.indexOf(pin);
    while (from !== -1 && hits.length < maxHits) {
      const nearest = nearestHeading(page.body, from);
      hits.push({
        anchor: nearest?.slug ?? null,
        heading: nearest?.text ?? null,
        snippet: snippetAround(page.body, from, pin.length)
      });
      from = hay.indexOf(pin, from + pin.length);
    }
  }

  const titleMatch = pin.length > 0 && (page.title.toLowerCase().includes(pin) || page.section.toLowerCase().includes(pin));
  return { slug: page.slug, title: page.title, section: page.section, count: countOccurrences(page.body, query), titleMatch, hits };
}
