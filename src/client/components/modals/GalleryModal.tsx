import { useId, useMemo, useState } from "react";
import type { Chapter } from "../../../schemas";
import { buildImageUrl } from "../../api";
import { groupCoverMedia, type CoverMediaItem } from "../../engine/coverMedia";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  pageSlice,
  parsePageSizeInput,
  totalPagesFor,
  type PageSize,
} from "../../engine/pagination";
import { useSideNavMode } from "../../hooks/useSideNavMode";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  Modal,
  Pagination,
  SearchBar,
  SideNav,
  Stack,
  StatusMessage,
  Text,
} from "../base";
import { ImageViewer } from "../common";

export type GalleryModalProps = {
  playthroughName: string;
  /** The story's images, newest first, archived chapters included. The caller builds this — the
   *  modal never reads the playthrough, so a second entry point can feed it from anywhere. */
  media: CoverMediaItem[];
  /** The story's chapter records, for the section list. A prop rather than a read, for the same
   *  reason `media` is. */
  chapters: Chapter[];
  /** The file the player picked, when the cover is a manual choice. Only a manual pick can be
   *  badged: the automatic chain is resolved server-side for the LIST, and this modal is opened
   *  from inside a playthrough, which carries the stored choice rather than the resolved one. */
  currentFile?: string;
  hasManualCover: boolean;
  saving?: boolean;
  /** Why the last write failed, shown in place — this modal is the only error surface the
   *  journal has. */
  errorMessage?: string;
  /** `fit` is gone: how a cover is shaped and filled is a display setting, not a property of a
   *  choice, so the choice is only ever which file. */
  onPick: (file: string) => void;
  onClear: () => void;
  onClose: () => void;
};

function formatMediaDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMediaCaption(item: CoverMediaItem): string {
  return [
    item.chapterName,
    item.turn !== undefined ? `Turn ${item.turn}` : undefined,
    new Date(item.createdAt).toLocaleString(),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Every generated image in the story — archived chapters included — sectioned by chapter and
 * browsed through the same side nav the docs viewer uses.
 *
 * The nav is one section per chapter because a long story's gallery is the list that grows
 * without bound: the running chapter first, closed chapters newest-first, and **All images** to
 * see the story whole. On a phone that nav is the same drawer, and this dialog is a full-screen
 * sheet.
 */
export function GalleryModal({
  playthroughName: _playthroughName,
  media,
  chapters,
  currentFile,
  hasManualCover,
  saving = false,
  errorMessage,
  onPick,
  onClear,
  onClose,
}: GalleryModalProps) {
  const titleId = useId();
  /** File path of the image currently opened in the full-screen viewer. */
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  /** "all", "current", or a chapter id. */
  const [selected, setSelected] = useState("all");
  const [search, setSearch] = useState("");
  const [rawPage, setRawPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const nav = useSideNavMode({ respectWorkspaceWidth: false });

  const groups = useMemo(
    () => groupCoverMedia(media, chapters),
    [media, chapters],
  );
  const visible = useMemo(
    () =>
      selected === "all"
        ? media
        : (groups.find((group) => group.chapterId === selected)?.items ??
          (selected === "current" ? (groups[0]?.items ?? []) : media)),
    [selected, media, groups],
  );

  const selectedName =
    selected === "all"
      ? "All images"
      : (groups.find((group) => group.chapterId === selected)?.name ??
        "Images");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((item) => {
      const promptMatch = item.prompt.toLowerCase().includes(q);
      const chapterMatch = (item.chapterName ?? "").toLowerCase().includes(q);
      const turnMatch =
        item.turn !== undefined &&
        (`turn ${item.turn}`.includes(q) || `t${item.turn}` === q);
      return promptMatch || chapterMatch || turnMatch;
    });
  }, [visible, search]);

  const totalPages = totalPagesFor(filtered.length, pageSize);
  const page = clampPage(rawPage, totalPages);
  const pagedItems = useMemo(
    () => pageSlice(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const viewingIndex = useMemo(
    () =>
      viewingFile
        ? filtered.findIndex((item) => item.file === viewingFile)
        : -1,
    [filtered, viewingFile],
  );
  const viewing = viewingIndex >= 0 ? filtered[viewingIndex] : null;

  const sections = [
    {
      label: "Everything",
      items: [
        {
          id: "all",
          label: "All images",
          meta: (
            <Badge variant="neutral" size="xs" pill>
              {media.length}
            </Badge>
          ),
        },
      ],
    },
    {
      label: "By chapter",
      items: groups
        .filter((group) => group.items.length > 0)
        .map((group) => ({
          id: group.chapterId ?? "current",
          label: group.name,
          meta: (
            <Badge variant="neutral" size="xs" pill>
              {group.items.length}
            </Badge>
          ),
        })),
    },
  ];

  function choose(id: string) {
    setSelected(id);
    setRawPage(1);
    // On a phone the drawer is a temporary overlay: choosing a section dismisses it.
    if (nav.narrow) nav.closeDrawer();
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setRawPage(1);
  }

  function handlePageSizeChange(next: PageSize) {
    setPageSize(next);
    setRawPage(1);
  }

  function handleCommitCustomPageSize(raw: string): boolean {
    const parsed = parsePageSizeInput(raw);
    if (parsed === null) return false;
    setPageSize(parsed);
    setRawPage(1);
    return true;
  }

  const subtitle =
    media.length === 0
      ? "No images in this story yet."
      : `${media.length} ${media.length === 1 ? "image" : "images"}` +
        (chapters.length > 0
          ? ` · ${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"}`
          : "") +
        (hasManualCover ? " · custom cover" : "");

  return (
    <>
      <Modal
        open
        onClose={onClose}
        dismissDisabled={nav.drawerOpen || viewing !== null}
        size="wide"
        fullScreenMobile
        ariaLabel="Gallery media"
        ariaLabelledBy={titleId}
      >
        <Header
          variant="modal"
          icon="Images"
          title="Gallery Media"
          titleId={titleId}
          subtitle={subtitle}
          bordered
          actions={
            <Stack direction="row" align="center" gap="xs" wrap>
              {hasManualCover ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClear}
                  disabled={saving}
                >
                  Clear custom cover
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="xs"
                leftIcon="X"
                onClick={onClose}
                aria-label="Close gallery"
              >
                Close
              </Button>
            </Stack>
          }
        />

        <Modal.Body>
          <Modal.Content>
            <Stack direction="column" gap="md" align="stretch" fullWidth>
              {errorMessage ? (
                <StatusMessage variant="banner" tone="err">
                  {errorMessage}
                </StatusMessage>
              ) : null}

              {media.length === 0 ? (
                <StatusMessage variant="inline" tone="neutral" icon="Images">
                  Images generated from the chat are collected here, newest
                  first and grouped by chapter. Generate one from an assistant
                  message and it becomes both a cover and a choice.
                </StatusMessage>
              ) : (
                <SideNav.Layout minHeight="md">
                  <SideNav
                    id="gallery-nav"
                    ariaLabel="Gallery chapters"
                    title={
                      <>
                        <Icon name="Images" size={16} /> Chapters
                      </>
                    }
                    sections={sections}
                    activeId={selected}
                    onSelect={choose}
                    hidden={!nav.narrow && nav.collapsed}
                    open={nav.narrow && nav.drawerOpen}
                    showScrim={nav.narrow && nav.drawerOpen}
                    onScrimClick={nav.closeDrawer}
                    emptyLabel="No images yet."
                  />

                  <SideNav.Main>
                    <Stack
                      direction="column"
                      gap="md"
                      align="stretch"
                      fullWidth
                    >
                      <SideNav.Toolbar bordered sticky>
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="sm"
                          wrap
                          fullWidth
                        >
                          <SideNav.Trigger
                            controlsId="gallery-nav"
                            open={nav.shown}
                            onClick={nav.toggle}
                            label={selectedName}
                            badge={
                              <Badge variant="neutral" size="xs" pill>
                                {filtered.length}
                              </Badge>
                            }
                            trailingIcon={
                              nav.narrow ? "ChevronRight" : undefined
                            }
                            tooltip={
                              nav.shown
                                ? "Hide the chapter list"
                                : "Show the chapter list"
                            }
                          />
                          <Stack flex1>
                            <SearchBar
                              value={search}
                              onChange={handleSearchChange}
                              placeholder="Filter by prompt, chapter, or turn…"
                              size="sm"
                            />
                          </Stack>
                        </Stack>
                      </SideNav.Toolbar>

                      {filtered.length === 0 ? (
                        <StatusMessage
                          variant="inline"
                          tone="neutral"
                          icon="Search"
                        >
                          No images match “{search.trim()}” in {selectedName}.
                        </StatusMessage>
                      ) : (
                        <Stack
                          direction="column"
                          gap="md"
                          align="stretch"
                          fullWidth
                        >
                          <FormGrid cols={3} gap="sm">
                            {pagedItems.map((item) => {
                              const isCurrentCover = currentFile === item.file;
                              return (
                                <Card
                                  key={item.file}
                                  as="article"
                                  variant="panel"
                                  padding="none"
                                  layout="column"
                                  active={isCurrentCover}
                                  hoverable
                                >
                                  <Card.Cover
                                    position="top"
                                    aspect="square"
                                    overlay={
                                      isCurrentCover ? (
                                        <Badge
                                          variant="accent"
                                          size="xs"
                                          pill
                                          leftIcon="Check"
                                        >
                                          Cover
                                        </Badge>
                                      ) : undefined
                                    }
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setViewingFile(item.file)}
                                      title={item.prompt || "View image"}
                                      aria-label="View image full size"
                                    >
                                      <img
                                        src={buildImageUrl(item.file)}
                                        alt={item.prompt.slice(0, 120)}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </button>
                                  </Card.Cover>

                                  <Card.Body padding="sm" gap="xs">
                                    <Stack
                                      direction="row"
                                      align="center"
                                      justify="between"
                                      gap="xs"
                                      wrap
                                      fullWidth
                                    >
                                      <Stack
                                        direction="row"
                                        align="center"
                                        gap="2xs"
                                        wrap
                                      >
                                        {item.chapterName ? (
                                          <Badge variant="neutral" size="xs">
                                            {item.chapterName}
                                          </Badge>
                                        ) : null}
                                        {item.turn !== undefined ? (
                                          <Badge variant="outline" size="xs">
                                            Turn {item.turn}
                                          </Badge>
                                        ) : null}
                                      </Stack>
                                      <Text size="2xs" tone="muted">
                                        {formatMediaDate(item.createdAt)}
                                      </Text>
                                    </Stack>

                                    {item.prompt ? (
                                      <Text
                                        as="p"
                                        size="xs"
                                        tone="secondary"
                                        lineClamp={2}
                                        title={item.prompt}
                                      >
                                        {item.prompt}
                                      </Text>
                                    ) : null}

                                    <Stack
                                      direction="row"
                                      align="center"
                                      justify="between"
                                      gap="xs"
                                      wrap
                                      fullWidth
                                    >
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        leftIcon="Maximize2"
                                        onClick={() =>
                                          setViewingFile(item.file)
                                        }
                                      >
                                        View
                                      </Button>
                                      <Button
                                        variant={
                                          isCurrentCover
                                            ? "secondary"
                                            : "primary"
                                        }
                                        size="xs"
                                        leftIcon={
                                          isCurrentCover ? "Check" : "Image"
                                        }
                                        disabled={saving || isCurrentCover}
                                        onClick={() => onPick(item.file)}
                                      >
                                        {isCurrentCover
                                          ? "Current cover"
                                          : "Use as cover"}
                                      </Button>
                                    </Stack>
                                  </Card.Body>
                                </Card>
                              );
                            })}
                          </FormGrid>

                          {filtered.length > DEFAULT_PAGE_SIZE ? (
                            <Pagination
                              itemLabel="images"
                              page={page}
                              pageSize={pageSize}
                              total={filtered.length}
                              onPageChange={setRawPage}
                              onPageSizeChange={handlePageSizeChange}
                              onCommitCustomPageSize={
                                handleCommitCustomPageSize
                              }
                            />
                          ) : null}
                        </Stack>
                      )}
                    </Stack>
                  </SideNav.Main>
                </SideNav.Layout>
              )}
            </Stack>
          </Modal.Content>
        </Modal.Body>
      </Modal>

      <ImageViewer
        image={
          viewing
            ? {
                src: buildImageUrl(viewing.file),
                alt: viewing.prompt.slice(0, 120),
                title: viewing.prompt,
                caption: formatMediaCaption(viewing),
              }
            : null
        }
        onClose={() => setViewingFile(null)}
        hasPrev={viewingIndex > 0}
        hasNext={viewingIndex >= 0 && viewingIndex < filtered.length - 1}
        onPrev={
          viewingIndex > 0
            ? () => setViewingFile(filtered[viewingIndex - 1]!.file)
            : undefined
        }
        onNext={
          viewingIndex >= 0 && viewingIndex < filtered.length - 1
            ? () => setViewingFile(filtered[viewingIndex + 1]!.file)
            : undefined
        }
        indexLabel={
          viewingIndex >= 0
            ? `${viewingIndex + 1} / ${filtered.length}`
            : undefined
        }
        actions={
          viewing ? (
            <Button
              variant={currentFile === viewing.file ? "secondary" : "primary"}
              size="xs"
              leftIcon={currentFile === viewing.file ? "Check" : "Image"}
              disabled={saving || currentFile === viewing.file}
              onClick={() => onPick(viewing.file)}
            >
              {currentFile === viewing.file ? "Current cover" : "Use as cover"}
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
