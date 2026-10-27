/** The in-app documentation viewer.
 *
 *  Docs are the repo's `docs/*.md`, read live through `/api/docs`, so a page can
 *  be edited in an editor and read here without a rebuild. The nav is built from
 *  each page's front-matter (`section` + `order`), so adding a page needs no
 *  registration anywhere.
 *
 *  `page` renders into the home workspace; `dialog` (or `overlay`) renders the
 *  same viewer as a full-screen-capable modal dialog so it is reachable from
 *  inside a playthrough.
 *
 *  The search box searches the page BODIES (`/api/docs/search`), not just the
 *  titles, and while a query is active the matched phrase stays highlighted in
 *  every page the reader opens — the highlight is part of the rendered markdown,
 *  so changing pages re-applies it and nothing has to be undone.
 *
 *  Below 768px (or when the workspace container is <= 767px) the page list becomes
 *  a drawer over the content; above it the same control collapses the column instead.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getDoc,
  listDocs,
  searchDocs,
  type DocPage,
  type DocPageMeta,
  type DocSearchResult,
} from "../../api";
import { MIN_QUERY_LENGTH } from "../../../engine/docsSearch";
import {
  Badge,
  Button,
  findScrollContainer,
  Header,
  Icon,
  IconButton,
  Modal,
  SearchBar,
  SideNav,
  Stack,
  StatusMessage,
  Text,
} from "../base";
import { DocMarkdownView } from "../common";
import { renderDocMarkdown } from "../../utils/docsMarkdown";
import { useSideNavMode } from "../../hooks/useSideNavMode";

export type DocsViewProps = {
  variant?: "page" | "dialog" | "overlay";
  open?: boolean;
  onClose?: () => void;
  /** Optional pre-loaded page list (used for SSR / unit tests). */
  initialPages?: DocPageMeta[];
  /** Optional pre-loaded active page (used for SSR / unit tests). */
  initialPage?: DocPage | null;
};

/** Group the ordered page list by section, preserving the order sections first
 *  appear in — the nav reads top-to-bottom the same way the index does. */
function groupBySection(
  pages: DocPageMeta[],
): Array<{ section: string; pages: DocPageMeta[] }> {
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
      </mark>,
    );
    key += 1;
    from = at + pin.length;
    at = lower.indexOf(pin, from);
  }
  if (from < snippet.length) parts.push(snippet.slice(from));
  return parts;
}

export function DocsView({
  variant = "page",
  open = true,
  onClose,
  initialPages = [],
  initialPage = null,
}: DocsViewProps) {
  const isDialog = variant === "dialog" || variant === "overlay";
  const titleId = useId();
  const [pages, setPages] = useState<DocPageMeta[]>(initialPages);
  const [activeSlug, setActiveSlug] = useState<string | null>(
    initialPage?.slug ?? initialPages[0]?.slug ?? null,
  );
  const [page, setPage] = useState<DocPage | null>(initialPage);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useSideNavMode({ respectWorkspaceWidth: !isDialog });

  const contentRef = useRef<HTMLDivElement | null>(null);
  /** An anchor requested with the page, applied once it has rendered. */
  const pendingAnchor = useRef<string | null>(null);

  const needle = query.trim();
  const searching = needle.length >= MIN_QUERY_LENGTH;

  // The nav lists whatever is on disk; the landing page is index.md when it exists.
  useEffect(() => {
    if (isDialog && !open) return;
    let cancelled = false;
    listDocs()
      .then((loaded) => {
        if (cancelled) return;
        setPages(loaded);
        setActiveSlug(
          (current) =>
            current ??
            loaded.find((p) => p.slug === "index")?.slug ??
            loaded[0]?.slug ??
            null,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the documentation list",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [isDialog, open]);

  useEffect(() => {
    if ((isDialog && !open) || !activeSlug) return;
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
        setError(
          err instanceof Error
            ? err.message
            : "Could not load that documentation page",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug, isDialog, open]);

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
    const scrollTarget = findScrollContainer(container) ?? container;
    scrollTarget.scrollTo({ top: 0 });
  }, [page]);

  const openDoc = useCallback(
    (slug: string, anchor?: string) => {
      // On a narrow screen the drawer is a temporary overlay: choosing a page dismisses it.
      if (nav.narrow) nav.closeDrawer();
      if (slug === activeSlug) {
        const container = contentRef.current;
        const target = anchor
          ? container?.querySelector(`[id="${CSS.escape(anchor)}"]`)
          : null;
        if (target) target.scrollIntoView({ block: "start" });
        else if (container) {
          const scrollTarget = findScrollContainer(container) ?? container;
          scrollTarget.scrollTo({ top: 0 });
        }
        return;
      }
      pendingAnchor.current = anchor ?? null;
      setActiveSlug(slug);
    },
    [activeSlug, nav],
  );

  const renderedMarkdown = useMemo(
    () =>
      page
        ? renderDocMarkdown(
            page.markdown,
            searching ? { highlight: needle } : {},
          )
        : "",
    [page, needle, searching],
  );

  /** Counted from the rendered HTML, never from the server's total: the chip must
   *  not claim a highlight the reader cannot see (a phrase split by inline markup
   *  is found by the raw-markdown search but is not one text run to mark). */
  const hitCount = useMemo(
    () => (renderedMarkdown.match(/class="doc-search-hit"/g) ?? []).length,
    [renderedMarkdown],
  );

  const groups = useMemo(() => groupBySection(pages), [pages]);

  if (isDialog && !open) return null;

  const viewerBody = (
    <SideNav.Layout>
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
          items: group.pages.map((entry) => ({
            id: entry.slug,
            label: entry.title,
          })),
        }))}
        activeId={activeSlug ?? undefined}
        onSelect={openDoc}
        headerExtra={
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search the documentation…"
            size="sm"
          />
        }
        listOverride={
          searching ? (
            <div className="side-nav-search-results" aria-live="polite">
              <span className="side-nav-group-label">
                {results
                  ? `${results.total} ${results.total === 1 ? "match" : "matches"} in ${results.pages.length} ${results.pages.length === 1 ? "page" : "pages"}`
                  : "Searching…"}
              </span>
              {results?.pages.map((entry) => (
                <div className="side-nav-search-page" key={entry.slug}>
                  <button
                    type="button"
                    className={`side-nav-item side-nav-search-page-title ${entry.slug === activeSlug ? "active" : ""}`}
                    onClick={() =>
                      openDoc(entry.slug, entry.hits[0]?.anchor ?? undefined)
                    }
                  >
                    <span>{entry.title}</span>
                    <span className="side-nav-search-count">{entry.count}</span>
                  </button>
                  {entry.hits.slice(0, 2).map((hit, index) => (
                    <button
                      type="button"
                      className="side-nav-search-hit"
                      key={`${entry.slug}-${index}`}
                      onClick={() =>
                        openDoc(entry.slug, hit.anchor ?? undefined)
                      }
                    >
                      {hit.heading ? (
                        <span className="side-nav-search-hit-heading">
                          {hit.heading}
                        </span>
                      ) : null}
                      <span className="side-nav-search-hit-snippet">
                        {splitSnippet(hit.snippet, needle)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {results && results.pages.length === 0 ? (
                <p className="side-nav-empty">
                  No page or paragraph matches “{needle}”.
                </p>
              ) : null}
            </div>
          ) : undefined
        }
        /* The drawer choice is per-viewport/workspace: wide screens collapse the column,
           narrow screens swing the drawer. */
        hidden={!nav.narrow && nav.collapsed}
        open={nav.narrow && nav.drawerOpen}
        showScrim={nav.narrow && nav.drawerOpen}
        onScrimClick={nav.closeDrawer}
        emptyLabel="No documentation pages found."
      />

      <SideNav.Main ref={contentRef}>
        <SideNav.Toolbar bordered sticky>
          <Stack direction="row" align="center" gap="sm" wrap>
            <SideNav.Trigger
              controlsId="docs-nav"
              open={nav.shown}
              onClick={nav.toggle}
              label={
                nav.narrow
                  ? page
                    ? `Pages: ${page.title}`
                    : "Browse Pages"
                  : nav.shown
                    ? "Hide Pages"
                    : "Show Pages"
              }
              badge={
                pages.length > 0 ? (
                  <Badge variant="neutral" size="xs" pill>
                    {pages.length}
                  </Badge>
                ) : undefined
              }
              trailingIcon={nav.narrow ? "ChevronRight" : undefined}
              tooltip={nav.shown ? "Hide the page list" : "Show the page list"}
            />
            {searching ? (
              <Badge
                variant="warning"
                size="sm"
                pill
                rightIcon={
                  <IconButton
                    icon="X"
                    size="xs"
                    variant="ghost"
                    label="Clear the search"
                    onClick={() => setQuery("")}
                  />
                }
              >
                {hitCount} highlighted
              </Badge>
            ) : null}
          </Stack>
        </SideNav.Toolbar>

        {error ? (
          <StatusMessage variant="banner" tone="err">
            {error}
          </StatusMessage>
        ) : null}

        {!error && loading && !page ? (
          <Text size="sm" tone="muted">
            Loading…
          </Text>
        ) : null}

        {!error && page ? (
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            <Header
              variant="section"
              bordered
              title={page.title}
              badge={
                page.section ? (
                  <Badge variant="neutral" size="xs">
                    {page.section}
                  </Badge>
                ) : undefined
              }
            />
            <DocMarkdownView html={renderedMarkdown} onNavigateDoc={openDoc} />
          </Stack>
        ) : null}
      </SideNav.Main>
    </SideNav.Layout>
  );

  if (isDialog) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        dismissDisabled={nav.drawerOpen}
        size="wide"
        fullScreenMobile
        ariaLabelledBy={titleId}
      >
        <Header
          variant="modal"
          title="Documentation"
          titleId={titleId}
          subtitle="Guides, architecture, and reference documentation."
          bordered
          actions={
            onClose ? (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leftIcon="X"
                tooltip="Close"
                tooltipSide="bottom"
                onClick={onClose}
                aria-label="Close documentation"
              />
            ) : undefined
          }
        />
        <Modal.Body>
          <Modal.Content>{viewerBody}</Modal.Content>
        </Modal.Body>
      </Modal>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      <Header
        variant="page"
        title="Documentation"
        subtitle="Guides, architecture, and reference documentation."
      />
      {viewerBody}
    </Stack>
  );
}
