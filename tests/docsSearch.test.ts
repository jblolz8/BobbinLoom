/** The docs search core: pure, no fs, no Fastify. The route is a thin shell
 *  over these, so the interesting behaviour is testable without a server. */
import { describe, expect, it } from "vitest";
import {
  MAX_HITS_PER_PAGE,
  MIN_QUERY_LENGTH,
  countOccurrences,
  snippetAround,
  searchPage,
  type SearchablePage,
} from "../src/engine/docsSearch";

const body = [
  "# Memory rotation",
  "",
  "The engine rotates memory events once the cap is reached.",
  "A second memory event is pruned on the same pass.",
  "",
  "## Rotation rules",
  "",
  "Memory events are capped at fifty.",
].join("\n");

const page = (over: Partial<SearchablePage> = {}): SearchablePage => ({
  slug: "chapters-and-memory",
  title: "Chapters & memory",
  section: "Playing",
  body,
  ...over,
});

describe("countOccurrences", () => {
  it("counts case-insensitively", () => {
    // the heading itself is an occurrence, so the fixture holds four
    expect(countOccurrences(body, "memory")).toBe(4);
    expect(countOccurrences(body, "MEMORY")).toBe(4);
    expect(countOccurrences(body, "Memory")).toBe(4);
  });

  it("counts non-overlapping matches", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
  });

  it("needs the whole phrase", () => {
    expect(countOccurrences(body, "memory event")).toBe(3);
    expect(countOccurrences(body, "memory zzz")).toBe(0);
  });

  it("treats the needle literally, not as a pattern", () => {
    expect(countOccurrences("axb and a.b", "a.b")).toBe(1);
    expect(countOccurrences("axb", "a.b")).toBe(0);
  });

  it("is zero for an empty needle", () => {
    expect(countOccurrences(body, "")).toBe(0);
  });
});

describe("snippetAround", () => {
  it("keeps the hit, collapses whitespace and marks clipped edges", () => {
    const snippet = snippetAround(body, body.indexOf("second memory"), "second memory".length);
    expect(snippet).toContain("second memory");
    expect(snippet).not.toMatch(/\s{2,}/);
    expect(snippet.startsWith("…")).toBe(true);
  });

  it("does not add a leading ellipsis at the start of the body", () => {
    expect(snippetAround("memory here", 0, 6).startsWith("…")).toBe(false);
  });

  it("never leaves a raw newline in a snippet", () => {
    expect(snippetAround(body, body.indexOf("The engine"), 10)).not.toContain("\n");
  });
});

describe("searchPage", () => {
  it("reports the full count but caps the hits", () => {
    const result = searchPage(page(), "memory", { maxHits: 2 });
    expect(result.count).toBe(4);
    expect(result.hits.length).toBe(2);
    expect(MAX_HITS_PER_PAGE).toBe(3);
  });

  it("attaches the nearest heading to each hit", () => {
    const result = searchPage(page(), "memory", { maxHits: 4 });
    expect(result.hits[0].anchor).toBe("memory-rotation");
    expect(result.hits[0].heading).toBe("Memory rotation");
    expect(result.hits[2].anchor).toBe("memory-rotation"); // still above the second heading
    expect(result.hits[3].anchor).toBe("rotation-rules"); // the caps-at-fifty line
  });

  it("has no anchor before the first heading", () => {
    const result = searchPage(page({ body: "preamble memory here\n\n# Later\n" }), "memory");
    expect(result.hits[0].anchor).toBeNull();
  });

  it("reports a title-only match with a zero count", () => {
    const result = searchPage(page({ title: "Lorebook vault", section: "World", body: "# Vaults\n\nNothing here.\n" }), "lorebook");
    expect(result.count).toBe(0);
    expect(result.titleMatch).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it("reports no match at all for an absent term", () => {
    const result = searchPage(page(), "zzz");
    expect(result.count).toBe(0);
    expect(result.titleMatch).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(searchPage(page(), "MEMORY").count).toBe(4);
  });
});

describe("MIN_QUERY_LENGTH", () => {
  it("is two, so a single letter never floods the page", () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});
