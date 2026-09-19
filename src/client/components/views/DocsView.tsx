/** The in-app documentation viewer.
 *
 *  Docs are the repo's `docs/*.md`, read live through `/api/docs`, so a page can
 *  be edited in an editor and read here without a rebuild. The nav is built from
 *  each page's front-matter (`section` + `order`), so adding a page needs no
 *  registration anywhere.
 *
 *  `page` renders into the home workspace; `overlay` renders the same viewer as
 *  a full-screen dialog so it is reachable from inside a playthrough.
 *
 *  The search box searches the page BODIES (`/api/docs/search`), not just the
 *  titles, and while a query is active the matched phrase stays highlighted in
 *  every page the reader opens — the highlight is part of the rendered markdown,
 *  so changing pages re-applies it and nothing has to be undone.
 *
 *  Below 768px the page list becomes a drawer over the content; above it the same
 *  control collapses the column instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDoc, listDocs, searchDocs, type DocPage, type DocPageMeta, type DocSearchResult } from "../../api";
import { MIN_QUERY_LENGTH } from "../../../engine/docsSearch";
import { Icon, IconButton, SearchBar, SideNav } from "../base";
import { renderDocMarkdown } from "../../utils/docsMarkdown";
import { useSideNavMode } from "../../hooks/useSideNavMode";

export type DocsViewProps = {
  variant?: "page" | "overlay";
  onClose?: () => void;
};

/** Group the ordered page list by section, preserving the order sections first
 *  appear in — the nav reads top-to-bottom the same way the index does. */
function groupBySection(pages: DocPageMeta[]): Array<{ section: string; pages: DocPageMeta[] }> {
  const groups: Array<{ section: string; pages: DocPageMeta[] }> = [];
  for (const page of pages) {
    const section = page.section || "Other";
    const existing = groups.find((group) => group.section === section);
    if (existing) existing.pages.push(page);
    else groups.push({ section, pages: [page] });
  }
  return groups;
}

/** Split a snippet around the needle so the match can be marked without
 *  `dangerouslySetInnerHTML` — the snippet is server text, and it stays text. */
function splitSnippet(snippet: string, needle: string): ReactNode[] {
  if (!needle) return [snippet];
  const parts: ReactNode[] = [];
  const lower = snippet.toLowerCase();
  const pin = needle.toLowerCase();
  let from = 0;
  let at = lower.indexOf(pin);
  let key = 0;

  while (at !== -1) {
    if (at > from) parts.push(snippet.slice(from, at));
    parts.push(
      <mark className="doc-search-hit" key={key}>
        {snippet.slice(at, at + pin.length)}
      </mark>
    );
    key += 1;
    from = at + pin.length;
    at = lower.indexOf(pin, from);
  }
  if (from < snippet.length) parts.push(snippet.slice(from));
  return parts;
}

export function DocsView({ variant = "page", onClose }: DocsViewProps) {
  const [pages, setPages] = useState<DocPageMeta[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [page, setPage] = useState<DocPage | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useSideNavMode();

  const contentRef = useRef<HTMLDivElement | null>(null);
  /** An anchor requested with the page, applied once it has rendered. */
  const pendingAnchor = useRef<string | null>(null);

  const needle = query.trim();
  const searching = needle.length >= MIN_QUERY_LENGTH;

  // The nav lists whatever is on disk; the landing page is index.md when it exists.
  useEffect(() => {
    let cancelled = false;
    listDocs()
      .then((loaded) => {
        if (cancelled) return;
        setPages(loaded);
        setActiveSlug((current) => current ?? loaded.find((p) => p.slug === "index")?.slug ?? loaded[0]?.slug ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the documentation list");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDoc(activeSlug)
      .then((loaded) => {
        if (!cancelled) setPage(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPage(null);
        setError(err instanceof Error ? err.message : "Could not load that documentation page");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  // Search the bodies, debounced: typing must not fire a request per keystroke.
  useEffect(() => {
    if (!searching) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchDocs(needle)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          // A failed search must not replace the page with an error: the reader
          // keeps reading and the nav simply lists nothing.
          if (!cancelled) setResults(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needle, searching]);

  // Apply the anchor (or reset to the top) only once the body is on screen.
  useEffect(() => {
    if (!page) return;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    const container = contentRef.current;
    if (!container) return;
    if (anchor) {
      const target = container.querySelector(`[id="${CSS.escape(anchor)}"]`);
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    container.scrollTo({ top: 0 });
  }, [page]);

  const openDoc = useCallback(
    (slug: string, anchor?: string) => {
      // On a narrow screen the drawer is a temporary overlay: choosing a page
      // dismisses it, the way a menu does.
      // On a narrow screen the drawer is a temporary overlay: choosing a page dismisses it.
      if (nav.narrow) nav.closeDrawer();
      if (slug === activeSlug) {
        const container = contentRef.current;
        const target = anchor ? container?.querySelector(`[id="${CSS.escape(anchor)}"]`) : null;
        if (target) target.scrollIntoView({ block: "start" });
        else container?.scrollTo({ top: 0 });
        return;
      }
      pendingAnchor.current = anchor ?? null;
      setActiveSlug(slug);
    },
    [activeSlug]
  );

  /** Cross-page links in the docs are markdown links; intercept them here so a
   *  click loads the page in place instead of navigating the whole app away.
   *  Copy buttons arrive the same way (the body is injected HTML, so the
   *  control's "copied" state is a DOM attribute rather than React state). */
  const handleContentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const copyButton = (event.target as HTMLElement).closest("[data-copy-code]");
      if (copyButton) {
        const code = copyButton.closest(".code-block")?.querySelector("code")?.textContent ?? "";
        void navigator.clipboard.writeText(code);
        copyButton.setAttribute("data-copied", "true");
        window.setTimeout(() => copyButton.removeAttribute("data-copied"), 2000);
        return;
      }

      const link = (event.target as HTMLElement).closest("a[data-doc-link]");
      if (!link) return;
      event.preventDefault();
      const target = link.getAttribute("data-doc-link") ?? "";
      const [file, anchor] = target.split("#");
      openDoc(file.replace(/\.md$/i, ""), anchor);
    },
    [openDoc]
  );

  // Escape closes the drawer first, then the dialog — closing the whole viewer
  // because the reader wanted the page list out of the way would lose their
  // place. The listener is on the document: a wrapper's onKeyDown only fires for
  // events that originate in its own subtree, which after opening is the header
  // button.
  useEffect(() => {
    if (variant !== "overlay" || !onClose) return;
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (nav.drawerOpen) {
        nav.closeDrawer();
        return;
      }
      onClose?.();
    }
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [nav.drawerOpen, nav.closeDrawer, onClose, variant]);

  const renderedMarkdown = useMemo(
    () => (page ? renderDocMarkdown(page.markdown, searching ? { highlight: needle } : {}) : ""),
    [page, needle, searching]
  );

  /** Counted from the rendered HTML, never from the server's total: the chip must
   *  not claim a highlight the reader cannot see (a phrase split by inline markup
   *  is found by the raw-markdown search but is not one text run to mark). */
  const hitCount = useMemo(() => (renderedMarkdown.match(/class="doc-search-hit"/g) ?? []).length, [renderedMarkdown]);

  const groups = useMemo(() => groupBySection(pages), [pages]);
  const viewClass = `docs-view docs-view-${variant}`;

  return (
    <div className={viewClass}>
      <SideNav
        id="docs-nav"
        ariaLabel="Documentation"
        title={
          <>
            <Icon name="BookText" size={16} /> Documentation
          </>
        }
        sections={groups.map((group) => ({
          label: group.section,
          items: group.pages.map((page) => ({ id: page.slug, label: page.title }))
        }))}
        activeId={activeSlug ?? undefined}
        onSelect={openDoc}
        headerExtra={
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search the documentation…"
            size="sm"
            containerClassName="docs-search"
          />
        }
        listOverride={
          searching ? (
            <div className="side-nav-list docs-search-results" aria-live="polite">
              <span className="side-nav-group-label">
                {results ? `${results.total} ${results.total === 1 ? "match" : "matches"} in ${results.pages.length} ${results.pages.length === 1 ? "page" : "pages"}` : "Searching…"}
              </span>
              {results?.pages.map((entry) => (
                <div className="docs-search-page" key={entry.slug}>
                  <button
                    className={`side-nav-item docs-search-page-title ${entry.slug === activeSlug ? "active" : ""}`}
                    onClick={() => openDoc(entry.slug, entry.hits[0]?.anchor ?? undefined)}
                  >
                    <span>{entry.title}</span>
                    <span className="docs-search-count">{entry.count}</span>
                  </button>
                  {entry.hits.slice(0, 2).map((hit, index) => (
                    <button
                      className="docs-search-hit"
                      key={`${entry.slug}-${index}`}
                      onClick={() => openDoc(entry.slug, hit.anchor ?? undefined)}
                    >
                      {hit.heading ? <span className="docs-search-hit-heading">{hit.heading}</span> : null}
                      <span className="docs-search-hit-snippet">{splitSnippet(hit.snippet, needle)}</span>
                    </button>
                  ))}
                </div>
              ))}
              {results && results.pages.length === 0 ? (
                <p className="side-nav-empty">No page or paragraph matches “{needle}”.</p>
              ) : null}
            </div>
          ) : undefined
        }
        /* The drawer choice is per-viewport: wide screens collapse the column, narrow screens
           swing the drawer. The primitive is told which, and owns neither decision. */
        hidden={!nav.narrow && nav.collapsed}
        open={nav.narrow && nav.drawerOpen}
        showScrim={nav.narrow && nav.drawerOpen}
        onScrimClick={nav.closeDrawer}
        emptyLabel="No documentation pages found."
      />

      <section className="docs-content" ref={contentRef}>
        {/* This toolbar sits OUTSIDE the nav on purpose: a collapse or a closed
            drawer must never take away the control that brings the page list
            back, and a phone has no Escape key for the dialog's close. */}
        <div className="docs-toolbar">
          <IconButton
            icon={nav.shown ? "PanelLeftClose" : "PanelLeft"}
            size="md"
            label={nav.shown ? "Hide the page list" : "Show the page list"}
            aria-expanded={nav.shown}
            aria-controls="docs-nav"
            onClick={nav.toggle}
          />
          {searching ? (
            <span className="docs-hit-chip">
              {hitCount} highlighted
              <IconButton icon="X" size="xs" variant="ghost" label="Clear the search" onClick={() => setQuery("")} />
            </span>
          ) : null}
          <span className="docs-toolbar-spacer" />
          {variant === "overlay" && onClose ? (
            <IconButton icon="X" label="Close documentation" size="md" onClick={onClose} />
          ) : null}
        </div>
        {error ? <pre className="error-box">{error}</pre> : null}
        {!error && loading && !page ? <p className="docs-loading">Loading…</p> : null}
        {!error && page ? (
          <>
            <header className="docs-page-header">
              <h1>{page.title}</h1>
              {page.section ? <span className="docs-page-section">{page.section}</span> : null}
            </header>
            <div
              className="doc-markdown"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
