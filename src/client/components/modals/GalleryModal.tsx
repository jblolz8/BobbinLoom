import { useId, useMemo, useRef, useState } from "react";
import type {
  Chapter,
  CharacterInstance,
  CharacterPortrait,
} from "../../../schemas";
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
import { ConfirmModal, ImageViewer } from "../common";

export type GalleryUploadFile = {
  dataBase64: string;
  fileName: string;
};

export type CharacterPortraitMediaItem = CharacterPortrait & {
  characterId: string;
  characterName: string;
  chapterName?: string;
  isCurrentPortrait: boolean;
};

export type GalleryModalProps = {
  playthroughName: string;
  /** The story's images, newest first, archived chapters included. The caller builds this — the
   *  modal never reads the playthrough, so a second entry point can feed it from anywhere. */
  media: CoverMediaItem[];
  /** The story's chapter records, for the section list. A prop rather than a read, for the same
   *  reason `media` is. */
  chapters: Chapter[];
  /** Optional playthrough characters so the sidebar can display the separate Character Portraits
   *  media section alongside story Gallery Media. */
  characters?: CharacterInstance[];
  /** Optional initial sidebar selection (e.g. "all", "portraits:all", or "portraits:<charId>"). */
  initialSelected?: string;
  /** The file the player picked, when the cover is a manual choice. Only a manual pick can be
   *  badged: the automatic chain is resolved server-side for the LIST, and this modal is opened
   *  from inside a playthrough, which carries the stored choice rather than the resolved one. */
  currentFile?: string;
  hasManualCover: boolean;
  saving?: boolean;
  uploading?: boolean;
  deletingFile?: string | null;
  /** Why the last write failed, shown in place — this modal is the only error surface the
   *  journal has. */
  errorMessage?: string;
  /** `fit` is gone: how a cover is shaped and filled is a display setting, not a property of a
   *  choice, so the choice is only ever which file. */
  onPick: (file: string) => void;
  onClear: () => void;
  onUpload?: (files: GalleryUploadFile[]) => Promise<void> | void;
  onDelete?: (file: string) => Promise<void> | void;
  onSelectCharacterPortrait?: (
    characterId: string,
    file: string,
  ) => Promise<void> | void;
  onDeleteCharacterPortrait?: (
    characterId: string,
    file: string,
  ) => Promise<void> | void;
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
  characters = [],
  initialSelected = "all",
  currentFile,
  hasManualCover,
  saving = false,
  uploading = false,
  deletingFile = null,
  errorMessage,
  onPick,
  onClear,
  onUpload,
  onDelete,
  onSelectCharacterPortrait,
  onDeleteCharacterPortrait,
  onClose,
}: GalleryModalProps) {
  const titleId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  /** File path of the image currently opened in the full-screen viewer. */
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<CoverMediaItem | null>(null);
  const [confirmDeletePortrait, setConfirmDeletePortrait] =
    useState<CharacterPortraitMediaItem | null>(null);
  /** "all", "uploaded", "current", a chapter id, "portraits:all", or "portraits:<characterId>". */
  const [selected, setSelected] = useState(initialSelected);
  const [search, setSearch] = useState("");
  const [rawPage, setRawPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const nav = useSideNavMode({ respectWorkspaceWidth: false });

  const chapterMap = useMemo(
    () => new Map(chapters.map((ch) => [ch.id, ch.name])),
    [chapters],
  );

  const portraitItems = useMemo<CharacterPortraitMediaItem[]>(() => {
    const items: CharacterPortraitMediaItem[] = [];
    for (const char of characters) {
      if (!char.templateId) continue;
      const list = char.avatars ?? [];
      for (const p of list) {
        items.push({
          ...p,
          characterId: char.id,
          characterName: char.name,
          chapterName: p.chapterId ? chapterMap.get(p.chapterId) : undefined,
          isCurrentPortrait: char.avatarFile === p.file,
        });
      }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [characters, chapterMap]);

  const charactersWithPortraits = useMemo(() => {
    return characters
      .filter((c) => c.templateId && (c.avatars?.length ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        count: c.avatars?.length ?? 0,
      }));
  }, [characters]);

  const isPortraitView = selected.startsWith("portraits:");

  const uploadedItems = useMemo(
    () => media.filter((item) => item.isUploaded),
    [media],
  );

  const groups = useMemo(
    () => groupCoverMedia(media, chapters),
    [media, chapters],
  );
  const visible = useMemo(() => {
    if (isPortraitView) return [];
    if (selected === "all") return media;
    if (selected === "uploaded") return uploadedItems;
    return (
      groups.find((group) => group.chapterId === selected)?.items ??
      (selected === "current" ? (groups[0]?.items ?? []) : media)
    );
  }, [isPortraitView, selected, media, uploadedItems, groups]);

  const visiblePortraits = useMemo(() => {
    if (!isPortraitView) return [];
    if (selected === "portraits:all") return portraitItems;
    const charId = selected.slice("portraits:".length);
    return portraitItems.filter((item) => item.characterId === charId);
  }, [isPortraitView, selected, portraitItems]);

  const selectedName = useMemo(() => {
    if (selected === "all") return "All images";
    if (selected === "uploaded") return "Uploaded / Custom";
    if (selected === "portraits:all") return "All character portraits";
    if (selected.startsWith("portraits:")) {
      const charId = selected.slice("portraits:".length);
      const char = characters.find((c) => c.id === charId);
      return char ? `${char.name} Portraits` : "Character Portraits";
    }
    return groups.find((group) => group.chapterId === selected)?.name ?? "Images";
  }, [selected, characters, groups]);

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

  const filteredPortraits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visiblePortraits;
    return visiblePortraits.filter((item) => {
      const promptMatch = item.prompt.toLowerCase().includes(q);
      const nameMatch = item.characterName.toLowerCase().includes(q);
      const chapterMatch = (item.chapterName ?? "").toLowerCase().includes(q);
      const turnMatch =
        item.turn !== undefined &&
        (`turn ${item.turn}`.includes(q) || `t${item.turn}` === q);
      return promptMatch || nameMatch || chapterMatch || turnMatch;
    });
  }, [visiblePortraits, search]);

  const activeCount = isPortraitView ? filteredPortraits.length : filtered.length;
  const totalPages = totalPagesFor(activeCount, pageSize);
  const page = clampPage(rawPage, totalPages);
  const pagedItems = useMemo(
    () => pageSlice(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  const pagedPortraits = useMemo(
    () => pageSlice(filteredPortraits, page, pageSize),
    [filteredPortraits, page, pageSize],
  );

  const viewingIndex = useMemo(() => {
    if (!viewingFile) return -1;
    return isPortraitView
      ? filteredPortraits.findIndex((item) => item.file === viewingFile)
      : filtered.findIndex((item) => item.file === viewingFile);
  }, [isPortraitView, filtered, filteredPortraits, viewingFile]);
  const viewing =
    !isPortraitView && viewingIndex >= 0 ? filtered[viewingIndex] : null;
  const viewingPortrait =
    isPortraitView && viewingIndex >= 0 ? filteredPortraits[viewingIndex] : null;

  const sections = [
    {
      label: "Story Gallery",
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
        ...(uploadedItems.length > 0 || selected === "uploaded"
          ? [
              {
                id: "uploaded",
                label: "Uploaded / Custom",
                meta: (
                  <Badge variant="neutral" size="xs" pill>
                    {uploadedItems.length}
                  </Badge>
                ),
              },
            ]
          : []),
      ],
    },
    ...(groups.some((g) => g.items.length > 0)
      ? [
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
        ]
      : []),
    ...(portraitItems.length > 0 || isPortraitView
      ? [
          {
            label: "Character Portraits",
            items: [
              {
                id: "portraits:all",
                label: "All character portraits",
                meta: (
                  <Badge variant="neutral" size="xs" pill>
                    {portraitItems.length}
                  </Badge>
                ),
              },
              ...charactersWithPortraits.map((char) => ({
                id: `portraits:${char.id}`,
                label: char.name,
                meta: (
                  <Badge variant="neutral" size="xs" pill>
                    {char.count}
                  </Badge>
                ),
              })),
            ],
          },
        ]
      : []),
  ];

  async function handleUploadInputChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !onUpload) return;
    const filesArray = Array.from(fileList);
    e.target.value = "";
    const encoded: GalleryUploadFile[] = [];
    for (const f of filesArray) {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result ?? "");
          const comma = res.indexOf(",");
          resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () =>
          reject(new Error(`Failed to read file ${f.name}`));
        reader.readAsDataURL(f);
      });
      if (dataBase64) {
        encoded.push({ dataBase64, fileName: f.name });
      }
    }
    if (encoded.length > 0) {
      await onUpload(encoded);
    }
  }

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
    media.length === 0 && portraitItems.length === 0
      ? "No images in this story yet."
      : `${media.length} ${media.length === 1 ? "image" : "images"}` +
        (portraitItems.length > 0
          ? ` · ${portraitItems.length} ${portraitItems.length === 1 ? "portrait" : "portraits"}`
          : "") +
        (chapters.length > 0
          ? ` · ${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"}`
          : "") +
        (hasManualCover ? " · custom cover" : "");

  return (
    <>
      {onUpload ? (
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void handleUploadInputChange(e);
          }}
        />
      ) : null}

      <Modal
        open
        onClose={onClose}
        dismissDisabled={
          nav.drawerOpen ||
          viewing !== null ||
          viewingPortrait !== null ||
          confirmDeleteItem !== null ||
          confirmDeletePortrait !== null
        }
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
              {onUpload && !isPortraitView ? (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon="Upload"
                  disabled={uploading || saving}
                  isLoading={uploading}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload Image"}
                </Button>
              ) : null}
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

              {media.length === 0 && portraitItems.length === 0 ? (
                <Stack direction="column" gap="sm" align="start" fullWidth>
                  <StatusMessage variant="inline" tone="neutral" icon="Images">
                    Images generated from the chat or uploaded directly are
                    collected here, newest first and grouped by chapter.
                    Generate one from an assistant message or upload an image to
                    use it as a cover or chat attachment.
                  </StatusMessage>
                  {onUpload ? (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon="Upload"
                      disabled={uploading || saving}
                      isLoading={uploading}
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      {uploading ? "Uploading…" : "Upload First Image"}
                    </Button>
                  ) : null}
                </Stack>
              ) : (
                <SideNav.Layout minHeight="md">
                  <SideNav
                    id="gallery-nav"
                    ariaLabel="Gallery chapters and portraits"
                    title={
                      <>
                        <Icon name="Images" size={16} /> Media
                      </>
                    }
                    sections={sections}
                    activeId={selected}
                    onSelect={(id) => {
                      choose(id);
                      setViewingFile(null);
                    }}
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
                                {activeCount}
                              </Badge>
                            }
                            trailingIcon={
                              nav.narrow ? "ChevronRight" : undefined
                            }
                            tooltip={
                              nav.shown
                                ? "Hide the section list"
                                : "Show the section list"
                            }
                          />
                          <Stack flex1>
                            <SearchBar
                              value={search}
                              onChange={handleSearchChange}
                              placeholder={
                                isPortraitView
                                  ? "Filter portraits by character, prompt, or turn…"
                                  : "Filter by prompt, chapter, or turn…"
                              }
                              size="sm"
                            />
                          </Stack>
                        </Stack>
                      </SideNav.Toolbar>

                      {activeCount === 0 ? (
                        <StatusMessage
                          variant="inline"
                          tone="neutral"
                          icon="Search"
                        >
                          {search.trim()
                            ? `No items match “${search.trim()}” in ${selectedName}.`
                            : `No items in ${selectedName} yet.`}
                        </StatusMessage>
                      ) : isPortraitView ? (
                        <Stack
                          direction="column"
                          gap="md"
                          align="stretch"
                          fullWidth
                        >
                          <FormGrid cols={3} gap="sm">
                            {pagedPortraits.map((item) => (
                              <Card
                                key={`${item.characterId}-${item.file}`}
                                as="article"
                                variant="panel"
                                padding="none"
                                layout="column"
                                active={item.isCurrentPortrait}
                                hoverable
                              >
                                <Card.Cover
                                  position="top"
                                  aspect="portrait"
                                  overlay={
                                    item.isCurrentPortrait ? (
                                      <Badge
                                        variant="accent"
                                        size="xs"
                                        pill
                                        leftIcon="Check"
                                      >
                                        Current portrait
                                      </Badge>
                                    ) : undefined
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() => setViewingFile(item.file)}
                                    title={item.prompt || "View portrait"}
                                    aria-label="View portrait full size"
                                  >
                                    <img
                                      src={buildImageUrl(item.file)}
                                      alt={
                                        item.prompt.slice(0, 120) ||
                                        item.characterName
                                      }
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
                                      <Badge variant="accent" size="xs">
                                        {item.characterName}
                                      </Badge>
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
                                    <Stack
                                      direction="row"
                                      align="center"
                                      gap="2xs"
                                      wrap
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
                                      {onDeleteCharacterPortrait ? (
                                        <Button
                                          variant="ghost"
                                          size="xs"
                                          leftIcon="Trash2"
                                          disabled={
                                            saving ||
                                            uploading ||
                                            deletingFile === item.file
                                          }
                                          onClick={() =>
                                            setConfirmDeletePortrait(item)
                                          }
                                        >
                                          {deletingFile === item.file
                                            ? "Deleting…"
                                            : "Delete"}
                                        </Button>
                                      ) : null}
                                    </Stack>
                                    {onSelectCharacterPortrait ? (
                                      <Button
                                        variant={
                                          item.isCurrentPortrait
                                            ? "secondary"
                                            : "primary"
                                        }
                                        size="xs"
                                        leftIcon={
                                          item.isCurrentPortrait
                                            ? "Check"
                                            : "User"
                                        }
                                        disabled={
                                          saving || item.isCurrentPortrait
                                        }
                                        onClick={() =>
                                          void onSelectCharacterPortrait(
                                            item.characterId,
                                            item.file,
                                          )
                                        }
                                      >
                                        {item.isCurrentPortrait
                                          ? "Current portrait"
                                          : "Set as current"}
                                      </Button>
                                    ) : null}
                                  </Stack>
                                </Card.Body>
                              </Card>
                            ))}
                          </FormGrid>

                          {filteredPortraits.length > DEFAULT_PAGE_SIZE ? (
                            <Pagination
                              itemLabel="portraits"
                              page={page}
                              pageSize={pageSize}
                              total={filteredPortraits.length}
                              onPageChange={setRawPage}
                              onPageSizeChange={handlePageSizeChange}
                              onCommitCustomPageSize={
                                handleCommitCustomPageSize
                              }
                            />
                          ) : null}
                        </Stack>
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
                                        {item.isUploaded ? (
                                          <Badge variant="info" size="xs">
                                            Uploaded
                                          </Badge>
                                        ) : null}
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
                                      <Stack
                                        direction="row"
                                        align="center"
                                        gap="2xs"
                                        wrap
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
                                        {onDelete ? (
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            leftIcon="Trash2"
                                            disabled={
                                              saving ||
                                              uploading ||
                                              deletingFile === item.file
                                            }
                                            onClick={() =>
                                              setConfirmDeleteItem(item)
                                            }
                                          >
                                            {deletingFile === item.file
                                              ? "Deleting…"
                                              : "Delete"}
                                          </Button>
                                        ) : null}
                                      </Stack>
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
            : viewingPortrait
              ? {
                  src: buildImageUrl(viewingPortrait.file),
                  alt:
                    viewingPortrait.prompt.slice(0, 120) ||
                    viewingPortrait.characterName,
                  title: `${viewingPortrait.characterName} — ${viewingPortrait.prompt}`,
                  caption: [
                    viewingPortrait.characterName,
                    viewingPortrait.chapterName,
                    viewingPortrait.turn !== undefined
                      ? `Turn ${viewingPortrait.turn}`
                      : undefined,
                    new Date(viewingPortrait.createdAt).toLocaleString(),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              : null
        }
        onClose={() => setViewingFile(null)}
        hasPrev={viewingIndex > 0}
        hasNext={viewingIndex >= 0 && viewingIndex < activeCount - 1}
        onPrev={
          viewingIndex > 0
            ? () =>
                setViewingFile(
                  isPortraitView
                    ? filteredPortraits[viewingIndex - 1]!.file
                    : filtered[viewingIndex - 1]!.file,
                )
            : undefined
        }
        onNext={
          viewingIndex >= 0 && viewingIndex < activeCount - 1
            ? () =>
                setViewingFile(
                  isPortraitView
                    ? filteredPortraits[viewingIndex + 1]!.file
                    : filtered[viewingIndex + 1]!.file,
                )
            : undefined
        }
        indexLabel={
          viewingIndex >= 0 ? `${viewingIndex + 1} / ${activeCount}` : undefined
        }
        actions={
          viewing ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {onDelete ? (
                <Button
                  variant="danger"
                  size="xs"
                  leftIcon="Trash2"
                  disabled={saving || deletingFile === viewing.file}
                  isLoading={deletingFile === viewing.file}
                  onClick={() => setConfirmDeleteItem(viewing)}
                >
                  Delete
                </Button>
              ) : null}
              <Button
                variant={currentFile === viewing.file ? "secondary" : "primary"}
                size="xs"
                leftIcon={currentFile === viewing.file ? "Check" : "Image"}
                disabled={saving || currentFile === viewing.file}
                onClick={() => onPick(viewing.file)}
              >
                {currentFile === viewing.file
                  ? "Current cover"
                  : "Use as cover"}
              </Button>
            </Stack>
          ) : viewingPortrait ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {onDeleteCharacterPortrait ? (
                <Button
                  variant="danger"
                  size="xs"
                  leftIcon="Trash2"
                  disabled={saving || deletingFile === viewingPortrait.file}
                  isLoading={deletingFile === viewingPortrait.file}
                  onClick={() => setConfirmDeletePortrait(viewingPortrait)}
                >
                  Delete
                </Button>
              ) : null}
              {onSelectCharacterPortrait ? (
                <Button
                  variant={
                    viewingPortrait.isCurrentPortrait ? "secondary" : "primary"
                  }
                  size="xs"
                  leftIcon={
                    viewingPortrait.isCurrentPortrait ? "Check" : "User"
                  }
                  disabled={saving || viewingPortrait.isCurrentPortrait}
                  onClick={() =>
                    void onSelectCharacterPortrait(
                      viewingPortrait.characterId,
                      viewingPortrait.file,
                    )
                  }
                >
                  {viewingPortrait.isCurrentPortrait
                    ? "Current portrait"
                    : "Set as current portrait"}
                </Button>
              ) : null}
            </Stack>
          ) : undefined
        }
      />

      {confirmDeleteItem && onDelete ? (
        <ConfirmModal
          title="Delete Image from Playthrough?"
          message={
            confirmDeleteItem.turn !== undefined ||
            confirmDeleteItem.chapterName
              ? `This will permanently delete this image from the playthrough gallery and detach it from ${[
                  confirmDeleteItem.chapterName,
                  confirmDeleteItem.turn !== undefined
                    ? `Turn ${confirmDeleteItem.turn}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}.`
              : "This will permanently delete this image from the playthrough gallery."
          }
          confirmLabel={
            deletingFile === confirmDeleteItem.file
              ? "Deleting…"
              : "Delete Image"
          }
          danger
          isLoading={deletingFile === confirmDeleteItem.file}
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={async () => {
            const targetFile = confirmDeleteItem.file;
            await onDelete(targetFile);
            if (viewingFile === targetFile) {
              setViewingFile(null);
            }
            setConfirmDeleteItem(null);
          }}
        />
      ) : null}

      {confirmDeletePortrait && onDeleteCharacterPortrait ? (
        <ConfirmModal
          title={`Delete Portrait for ${confirmDeletePortrait.characterName}?`}
          message={`This will permanently delete this portrait${
            confirmDeletePortrait.turn !== undefined
              ? ` (Turn ${confirmDeletePortrait.turn})`
              : ""
          } from ${confirmDeletePortrait.characterName}'s portrait history.${
            confirmDeletePortrait.isCurrentPortrait
              ? " Their active portrait will fall back to the previous portrait (or library default)."
              : ""
          }`}
          confirmLabel={
            deletingFile === confirmDeletePortrait.file
              ? "Deleting…"
              : "Delete Portrait"
          }
          danger
          isLoading={deletingFile === confirmDeletePortrait.file}
          onCancel={() => setConfirmDeletePortrait(null)}
          onConfirm={async () => {
            const { characterId, file } = confirmDeletePortrait;
            await onDeleteCharacterPortrait(characterId, file);
            if (viewingFile === file) {
              setViewingFile(null);
            }
            setConfirmDeletePortrait(null);
          }}
        />
      ) : null}
    </>
  );
}
