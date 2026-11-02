import { useEffect, useMemo, useState } from "react";
import type {
  LorebookSummary,
  MemoryEvent,
  Playthrough,
} from "../../../../../schemas";
import {
  closeChapter,
  listLorebooks,
  type CloseChapterBody,
  type TokenUsage,
} from "../../../../api";
import {
  Accordion,
  AvatarBadge,
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  SearchBar,
  Separator,
  Stack,
  StatusMessage,
  Text,
} from "../../../base";
import {
  adoptLocalPreferences,
  buildImageUrl,
  clearPlaythroughCover,
  setPlaythroughCover,
  updateViewPreferences,
} from "../../../../api";
import { buildCoverMedia } from "../../../../engine/coverMedia";
import {
  chapterStaleSignature,
  chapterSummaryIsStale,
} from "../../../../../engine/chapterLifecycle";
import { GalleryModal } from "../../../modals/GalleryModal";
import { CloseChapterModal } from "../../../modals/CloseChapterModal";

export function JournalTab({
  playthrough,
  onPlaythroughChange,
  onViewChapter,
  onCloseChapterComplete,
  onResummarizeChapter,
  resummarizingChapterId,
  onRevertToChapter,
  onStartNewWithSameScenario,
  onOpenTimelines,
}: {
  playthrough: Playthrough;
  onPlaythroughChange: (updated: Playthrough) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  /** Re-runs the summarizer on an archived chapter (one implementation: the chat's own
   *  "Re-summarize previous chapter" action calls the same handler). */
  onResummarizeChapter: (chapterId: string) => void;
  resummarizingChapterId: string | null;
  /** Ask to revert to this chapter: everything after it is discarded and it becomes the running
   *  chapter again. The confirm dialog (with the counts and the backup button) lives in PlayView. */
  onRevertToChapter: (chapterId: string, chapterName: string) => void;
  onStartNewWithSameScenario: (
    scenarioDescription: string,
    personaId: string | undefined,
    initialCastIds: string[] | undefined,
    originalName: string,
  ) => void;
  onOpenTimelines?: () => void;
}) {
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [lorebookSummaries, setLorebookSummaries] = useState<LorebookSummary[]>(
    [],
  );
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  /** Which chapter's stale-summary note was dismissed, and for which edit signature. Keyed on the
   *  chapter PLUS the signature, so a later edit warns again instead of being silenced for good.
   *  The server owns the record; state starts empty and the mount effect below fills it. */
  const [staleDismissals, setStaleDismissals] = useState<
    Record<string, string>
  >({});

  // Filter state for timeline events
  const [eventSearch, setEventSearch] = useState("");
  const [minImportance, setMinImportance] = useState<number>(0);
  const [hoverImportance, setHoverImportance] = useState<number | null>(null);

  // A dismissal only ever ADDS a key, so the server's copy is merged UNDER whatever is already here:
  // a dismissal made while this read was in flight must not be dropped when the answer lands.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      setStaleDismissals((current) => ({
        ...(preferences.staleNoteDismissals ?? {}),
        ...current,
      }));
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listLorebooks()
      .then(setLorebookSummaries)
      .catch(() => setLorebookSummaries([]));
  }, [playthrough.id]);

  const attachedLorebooks = lorebookSummaries.filter((lb) =>
    playthrough.lorebookIds?.includes(lb.id),
  );

  // Newest first, hidden messages skipped, one entry per file — see buildCoverMedia.
  const media = useMemo(() => buildCoverMedia(playthrough), [playthrough]);

  // Both writes answer with the whole document, which the play view already owns: handing it
  // back through the existing change channel is what keeps the card, the gallery badge and the
  // journal strip agreeing with the server without a second read.
  async function handlePickCover(file: string) {
    setCoverSaving(true);
    setCoverError(null);
    try {
      onPlaythroughChange(await setPlaythroughCover(playthrough.id, { file }));
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : String(e));
    } finally {
      setCoverSaving(false);
    }
  }

  async function handleClearCover() {
    setCoverSaving(true);
    setCoverError(null);
    try {
      onPlaythroughChange(await clearPlaythroughCover(playthrough.id));
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : String(e));
    } finally {
      setCoverSaving(false);
    }
  }

  const events = useMemo(() => {
    const all = new Map<string, MemoryEvent>();
    for (const e of playthrough.memoryLayers?.compressed ?? [])
      all.set(e.id, e);
    for (const e of playthrough.memoryLayers?.recent ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryEvents) all.set(e.id, e);
    return [...all.values()].sort((a, b) => b.turn - a.turn);
  }, [playthrough]);

  type ChapterEventGroup = {
    chapterId: string | null;
    chapterName: string;
    turnRange?: { start: number; end: number };
    metaSummary?: string;
    events: MemoryEvent[];
  };

  const chapterGroups = useMemo((): ChapterEventGroup[] => {
    const all = new Map<string, MemoryEvent>();
    for (const e of playthrough.memoryLayers?.compressed ?? [])
      all.set(e.id, e);
    for (const e of playthrough.memoryLayers?.recent ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryEvents) all.set(e.id, e);

    const currentEvents: MemoryEvent[] = [];
    const archiveMap = new Map<string, MemoryEvent[]>();

    for (const e of all.values()) {
      if (e.chapterId) {
        const bucket = archiveMap.get(e.chapterId) ?? [];
        bucket.push(e);
        archiveMap.set(e.chapterId, bucket);
      } else {
        currentEvents.push(e);
      }
    }

    const metas = playthrough.storyMetaSummaries ?? [];
    const foldedIds = new Set<string>();
    for (const m of metas) for (const id of m.chapterIds) foldedIds.add(id);

    const groups: ChapterEventGroup[] = [];

    groups.push({
      chapterId: null,
      chapterName: "Current Chapter",
      events: currentEvents.sort((a, b) => b.turn - a.turn),
    });

    const archived = [...(playthrough.chapters ?? [])].reverse();
    for (const ch of archived) {
      if (foldedIds.has(ch.id)) continue;
      const chEvents = archiveMap.get(ch.id) ?? [];
      if (chEvents.length === 0) continue;
      groups.push({
        chapterId: ch.id,
        chapterName: ch.name,
        turnRange: ch.turnRange,
        events: chEvents.sort((a, b) => b.turn - a.turn),
      });
    }

    if (metas.length > 0) {
      const latest = metas[metas.length - 1];
      const metaEvents: MemoryEvent[] = [];
      for (const id of latest.chapterIds) {
        const evts = archiveMap.get(id) ?? [];
        for (const e of evts) metaEvents.push(e);
      }
      if (metaEvents.length > 0 || latest.summary) {
        groups.push({
          chapterId: "compacted",
          chapterName: `Chapters ${latest.chapterIds.length} (compacted)`,
          turnRange: latest.turnRange,
          metaSummary: latest.summary,
          events: metaEvents.sort((a, b) => b.turn - a.turn),
        });
      }
    }

    return groups;
  }, [playthrough]);

  // Filtered groups based on search & importance
  const filteredChapterGroups = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return chapterGroups
      .map((group) => {
        const filteredEvents = group.events.filter((e) => {
          if (minImportance > 0 && e.importance < minImportance) return false;
          if (query) {
            const matchSummary = e.summary?.toLowerCase().includes(query);
            const matchType = e.type?.toLowerCase().includes(query);
            const matchTurn = `t${e.turn}`.toLowerCase().includes(query);
            if (!matchSummary && !matchType && !matchTurn) return false;
          }
          return true;
        });
        return {
          ...group,
          events: filteredEvents,
        };
      })
      .filter(
        (group) =>
          group.events.length > 0 ||
          (!query && minImportance === 0 && group.chapterId === null),
      );
  }, [chapterGroups, eventSearch, minImportance]);

  const visibleMessages = playthrough.messages.filter(
    (m) => !m.hidden && !m.chapterId,
  );
  const canClose = visibleMessages.length >= 6;

  /** The dialog owns its fields (and remembers the chosen connection); the call lives here,
   *  because the play view owns the document the close answers with. */
  async function handleCloseChapter(body: CloseChapterBody) {
    setClosing(true);
    setCloseError(null);
    try {
      const { state, tokenUsage } = await closeChapter(playthrough.id, body);
      onPlaythroughChange(state);
      onCloseChapterComplete(tokenUsage);
      setCloseModalOpen(false);
    } catch (e) {
      setCloseError(
        e instanceof Error ? e.message : "Closing the chapter failed",
      );
    } finally {
      setClosing(false);
    }
  }

  function dismissStaleNote(chapterId: string, signature: string) {
    // State first, then the write: the updater stays pure, so StrictMode's double invoke cannot send
    // the patch twice. A failed write must not stop the note going away for this session.
    const next = { ...staleDismissals, [chapterId]: signature };
    setStaleDismissals(next);
    void updateViewPreferences({ staleNoteDismissals: next }).catch(() => {});
  }

  function setChapterExpanded(chapterId: string, open: boolean) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (open) next.add(chapterId);
      else next.delete(chapterId);
      return next;
    });
  }

  function renderStars(importance: number) {
    const count = Math.max(1, Math.min(5, Math.round(importance)));
    return (
      <Stack
        direction="row"
        align="center"
        gap="2xs"
        title={`Importance: ${importance.toFixed(1)}/5`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon
            key={i}
            name="Star"
            size={11}
            style={{
              opacity: i < count ? 1 : 0.2,
              color: "var(--status-warning)",
              fill: i < count ? "currentColor" : "none",
            }}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* Header Row */}
      <Header
        variant="section"
        icon="BookOpen"
        title="Journal"
        actions={
          onOpenTimelines ? (
            <Button
              variant="outline"
              size="sm"
              leftIcon="GitFork"
              onClick={onOpenTimelines}
              title="View alternative timeline branches for this playthrough"
            >
              View Timelines
            </Button>
          ) : undefined
        }
      />

      {/* About this Playthrough (Setting & Scenario) */}
      {playthrough.scenarioDescription ? (
        <Card
          as="article"
          variant="elevated"
          padding="md"
          layout="column"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Compass" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Setting &amp; Scenario
            </Text>
          </Stack>
          <Text as="p" size="xs" tone="secondary" leading="relaxed" preWrap>
            {playthrough.scenarioDescription}
          </Text>
          <Stack direction="row" align="center" justify="end" fullWidth>
            <Button
              variant="primary"
              size="sm"
              leftIcon="Copy"
              onClick={() =>
                onStartNewWithSameScenario(
                  playthrough.scenarioDescription!,
                  playthrough.personaId,
                  playthrough.initialCastIds,
                  playthrough.name,
                )
              }
              title="Start a new game using this scenario, cast, and persona"
            >
              Start New with Same Scenario
            </Button>
          </Stack>
        </Card>
      ) : null}

      {/* Lorebooks */}
      <Card
        as="section"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="BookMarked" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Lorebooks
            </Text>
          </Stack>
          {attachedLorebooks.length > 0 ? (
            <Badge variant="neutral" size="xs" pill>
              {attachedLorebooks.length} attached
            </Badge>
          ) : null}
        </Stack>

        {attachedLorebooks.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="BookX">
            No lorebooks attached to this playthrough
          </StatusMessage>
        ) : (
          <Stack direction="row" align="center" gap="xs" wrap fullWidth>
            {attachedLorebooks.map((lb) => (
              <Badge
                key={lb.id}
                variant="outline"
                size="sm"
                leftIcon="BookOpen"
                title={`${lb.entryCount} active lore entries`}
              >
                <Text as="span" size="xs" weight="medium">
                  {lb.name}
                </Text>
                <Text as="span" size="xs" tone="muted">
                  ({lb.entryCount} entries)
                </Text>
              </Badge>
            ))}
          </Stack>
        )}
      </Card>

      {/* Chapters (The Chronicle) */}
      <Card
        as="section"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Scroll" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Chapters
            </Text>
          </Stack>
          <Badge variant="neutral" size="xs" pill>
            {(playthrough.chapters?.length ?? 0) + 1}{" "}
            {(playthrough.chapters?.length ?? 0) + 1 === 1
              ? "volume"
              : "volumes"}
          </Badge>
        </Stack>

        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          {/* Active / Current Chapter */}
          <Card variant="panel" padding="sm" layout="column" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <Stack direction="row" align="center" gap="xs">
                <Icon name="BookOpen" size={15} />
                <Text as="h4" variant="title" size="sm" weight="semibold">
                  Current Chapter
                </Text>
              </Stack>
              <Badge variant="success" size="xs" pill>
                ● Ongoing
              </Badge>
            </Stack>

            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="sm"
              wrap
              fullWidth
            >
              <Text size="xs" tone="muted">
                {visibleMessages.length} message
                {visibleMessages.length === 1 ? "" : "s"} in session
                {!canClose
                  ? ` (need ${6 - visibleMessages.length} more to close)`
                  : " · Ready to summarize"}
              </Text>
              <Button
                variant="primary"
                size="sm"
                leftIcon="BookmarkCheck"
                disabled={!canClose || closing}
                isLoading={closing}
                onClick={() => setCloseModalOpen(true)}
                title={
                  !canClose
                    ? "Play a bit longer before closing this chapter"
                    : "Close and summarize this chapter into an archived volume"
                }
              >
                {closing ? "Closing…" : "Close Chapter"}
              </Button>
            </Stack>
          </Card>

          {/* Archived Volumes */}
          {[...(playthrough.chapters ?? [])].length > 0 ? (
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              {[...(playthrough.chapters ?? [])].reverse().map((ch) => {
                const isExpanded = expandedChapters.has(ch.id);
                // Derived, never stored: an edit after the summary was written makes it stale, and
                // re-summarizing (which stamps the chapter) clears it with no second write.
                const staleSignature = chapterSummaryIsStale(
                  ch,
                  playthrough.messages,
                )
                  ? chapterStaleSignature(ch, playthrough.messages)
                  : null;
                const staleNoteShown =
                  staleSignature !== null &&
                  staleDismissals[ch.id] !== staleSignature;
                return (
                  <Accordion
                    key={ch.id}
                    variant="panel"
                    size="sm"
                    icon="BookOpen"
                    title={ch.name}
                    open={isExpanded}
                    onOpenChange={(open) => setChapterExpanded(ch.id, open)}
                    badge={
                      <Badge variant="neutral" size="xs">
                        T{ch.turnRange.start} – T{ch.turnRange.end}
                      </Badge>
                    }
                    summary={
                      !isExpanded && ch.shortDescription ? (
                        <Text size="xs" tone="muted" italic>
                          {ch.shortDescription}
                        </Text>
                      ) : undefined
                    }
                  >
                    <Stack
                      direction="column"
                      align="stretch"
                      gap="sm"
                      fullWidth
                    >
                      {ch.shortDescription ? (
                        <Text as="p" size="xs" tone="muted" italic>
                          {ch.shortDescription}
                        </Text>
                      ) : null}

                      {staleNoteShown ? (
                        <StatusMessage
                          variant="banner"
                          tone="warn"
                          icon="TriangleAlert"
                          onDismiss={() =>
                            dismissStaleNote(ch.id, staleSignature)
                          }
                        >
                          This summary was written before a later edit to this
                          chapter&apos;s messages, so it may no longer match
                          them.
                        </StatusMessage>
                      ) : null}

                      <Text
                        as="p"
                        size="xs"
                        tone="secondary"
                        leading="relaxed"
                        preWrap
                      >
                        {ch.fullSummary}
                      </Text>

                      <Separator spacing="none" />

                      <Stack
                        direction="row"
                        align="center"
                        justify="between"
                        gap="xs"
                        wrap
                        fullWidth
                      >
                        <Text
                          size="xs"
                          tone="muted"
                          title={`Archived: ${ch.createdAt ? new Date(ch.createdAt).toLocaleString() : "Unknown"}${ch.summaryDurationMs ? ` (summarized in ${(ch.summaryDurationMs / 1000).toFixed(1)}s)` : ""}`}
                        >
                          {ch.createdAt
                            ? new Date(ch.createdAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : ""}
                        </Text>

                        <Stack direction="row" align="center" gap="xs" wrap>
                          <Button
                            variant="outline"
                            size="xs"
                            leftIcon="RefreshCw"
                            disabled={resummarizingChapterId === ch.id}
                            isLoading={resummarizingChapterId === ch.id}
                            title="Rewrite this chapter's summary from its messages"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResummarizeChapter(ch.id);
                            }}
                          >
                            {resummarizingChapterId === ch.id
                              ? "Summarizing…"
                              : "Re-summarize"}
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            leftIcon="FileText"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewChapter(ch.id);
                            }}
                          >
                            View Transcript
                          </Button>
                          <Button
                            variant="danger"
                            size="xs"
                            leftIcon="Undo2"
                            title="Discard every chapter after this one and make it the running chapter again"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertToChapter(ch.id, ch.name);
                            }}
                          >
                            Revert to this Chapter
                          </Button>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Accordion>
                );
              })}
            </Stack>
          ) : (
            <StatusMessage variant="inline" tone="neutral" icon="Layers">
              No archived chapters yet. When you close a chapter, its transcript
              and summary will be saved here.
            </StatusMessage>
          )}
        </Stack>
      </Card>

      {/* Media */}
      <Card
        as="section"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Image" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Media
            </Text>
          </Stack>
          {media.length > 0 ? (
            <Badge variant="neutral" size="xs" pill>
              {media.length}
            </Badge>
          ) : null}
        </Stack>

        {media.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="Image">
            No generated images yet. An image on an assistant message becomes
            this story&apos;s cover, and every image from every chapter can be
            chosen by hand here.
          </StatusMessage>
        ) : (
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            <FormGrid cols={2} gap="xs" keepColumnsOnMobile>
              {media.slice(0, 4).map((item) => {
                const isCurrentCover = playthrough.cover?.file === item.file;
                return (
                  <Card
                    key={item.file}
                    as="button"
                    type="button"
                    variant="panel"
                    padding="none"
                    active={isCurrentCover}
                    hoverable
                    onClick={() => setGalleryOpen(true)}
                    title={item.prompt || "Open the gallery"}
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
                      <img
                        src={buildImageUrl(item.file)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </Card.Cover>
                  </Card>
                );
              })}
            </FormGrid>

            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <Text size="xs" tone="secondary">
                {media.length} {media.length === 1 ? "image" : "images"} across
                every chapter
              </Text>
              <Button
                variant="secondary"
                size="sm"
                leftIcon="Images"
                onClick={() => setGalleryOpen(true)}
              >
                Open Gallery Media
              </Button>
            </Stack>
          </Stack>
        )}
      </Card>

      {galleryOpen ? (
        <GalleryModal
          playthroughName={playthrough.name}
          media={media}
          chapters={playthrough.chapters ?? []}
          currentFile={playthrough.cover?.file}
          hasManualCover={Boolean(playthrough.cover)}
          saving={coverSaving}
          errorMessage={coverError ?? undefined}
          onPick={(file) => {
            void handlePickCover(file);
          }}
          onClear={() => {
            void handleClearCover();
          }}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}

      {/* Close Chapter Modal */}
      {closeModalOpen ? (
        <CloseChapterModal
          visibleMessageCount={visibleMessages.length}
          isLoading={closing}
          errorMessage={closeError}
          onConfirm={(body) => {
            void handleCloseChapter(body);
          }}
          onCancel={() => {
            setCloseModalOpen(false);
            setCloseError(null);
          }}
        />
      ) : null}

      {/* Dramatis Personae (Cast & Acquaintances) */}
      <Card
        as="section"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Users" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Dramatis Personae
            </Text>
          </Stack>
          <Badge variant="neutral" size="xs" pill>
            {playthrough.characters.length} persons
          </Badge>
        </Stack>

        {playthrough.characters.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="UserX">
            No cast or characters encountered yet
          </StatusMessage>
        ) : (
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            {playthrough.characters.map((c) => {
              const isActive = (playthrough.activeCharacters ?? []).includes(
                c.id,
              );
              return (
                <Card key={c.id} variant="panel" padding="sm" fullWidth>
                  <Stack direction="row" align="start" gap="sm" fullWidth>
                    <AvatarBadge name={c.name} icon="User" size="sm" />
                    <Stack
                      direction="column"
                      align="stretch"
                      gap="2xs"
                      flex1
                      fullWidth
                    >
                      <Stack
                        direction="row"
                        align="center"
                        justify="between"
                        gap="xs"
                        wrap
                        fullWidth
                      >
                        <Stack direction="row" align="center" gap="xs" wrap>
                          <Text
                            as="strong"
                            size="xs"
                            weight="semibold"
                            title={c.name}
                          >
                            {c.name}
                          </Text>
                          {c.storyRole ? (
                            <Badge
                              variant="neutral"
                              size="xs"
                              title={`Role: ${c.storyRole}`}
                            >
                              {c.storyRole}
                            </Badge>
                          ) : null}
                        </Stack>
                        <Badge
                          variant={isActive ? "success" : "neutral"}
                          size="xs"
                          pill
                        >
                          {isActive ? "● In Scene" : "○ Off-Screen"}
                        </Badge>
                      </Stack>
                      {c.description ? (
                        <Text as="p" size="xs" tone="muted" leading="snug">
                          {c.description}
                        </Text>
                      ) : c.memorySummary ? (
                        <Text as="p" size="xs" tone="muted" leading="snug">
                          {c.memorySummary}
                        </Text>
                      ) : null}
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Card>

      {/* Event Timeline (Chronological Adventure Log) */}
      <Card
        as="section"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Clock" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Event Timeline
            </Text>
          </Stack>
          <Badge variant="neutral" size="xs" pill>
            {events.length} event{events.length === 1 ? "" : "s"}
          </Badge>
        </Stack>

        {/* Filter Toolbar */}
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          wrap
          fullWidth
        >
          <Stack flex1>
            <SearchBar
              value={eventSearch}
              onChange={setEventSearch}
              placeholder="Search events (turn, type, text)…"
              size="sm"
            />
          </Stack>
          <Card
            variant="panel"
            padding="xs"
            role="group"
            aria-label="Filter events by importance"
          >
            <Stack direction="row" align="center" gap="2xs">
              <Button
                variant={minImportance === 0 ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setMinImportance(0)}
                title="Show all events"
                aria-pressed={minImportance === 0}
              >
                All
              </Button>
              <Stack
                direction="row"
                align="center"
                gap="2xs"
                onMouseLeave={() => setHoverImportance(null)}
                role="radiogroup"
                aria-label="Minimum importance rating"
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const effectiveRating = hoverImportance ?? minImportance;
                  const isLit = star <= effectiveRating;
                  const isSelected = minImportance === star;

                  return (
                    <Button
                      key={star}
                      type="button"
                      size="xs"
                      variant={isSelected ? "secondary" : "ghost"}
                      iconOnly
                      onClick={() => {
                        setMinImportance((prev) => (prev === star ? 0 : star));
                      }}
                      onMouseEnter={() => setHoverImportance(star)}
                      title={`Filter by ${star}★ or higher (click again to reset)`}
                      aria-label={`${star} star${star === 1 ? "" : "s"} or higher`}
                    >
                      <Icon
                        name="Star"
                        size={12}
                        style={{
                          color: isLit
                            ? "var(--status-warning, #fbbf24)"
                            : "var(--text-disabled)",
                          fill: isLit ? "currentColor" : "none",
                        }}
                      />
                    </Button>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        </Stack>

        {events.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="CalendarX">
            No recorded events yet
          </StatusMessage>
        ) : filteredChapterGroups.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="Search">
            No events match current filter criteria
          </StatusMessage>
        ) : (
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            {filteredChapterGroups.map((group) => {
              const groupKey = group.chapterId ?? "current";
              const isExpanded =
                group.chapterId === null ||
                expandedChapters.has(group.chapterId);
              return (
                <Accordion
                  key={groupKey}
                  variant="panel"
                  size="sm"
                  icon={group.chapterId ? "BookOpen" : "Bookmark"}
                  title={group.chapterName}
                  open={isExpanded}
                  onOpenChange={(open) => {
                    if (group.chapterId) {
                      setChapterExpanded(group.chapterId, open);
                    }
                  }}
                  badge={
                    <Stack direction="row" align="center" gap="2xs">
                      <Badge variant="neutral" size="xs" pill>
                        {group.events.length} event
                        {group.events.length !== 1 ? "s" : ""}
                      </Badge>
                      {group.turnRange ? (
                        <Badge variant="outline" size="xs">
                          T{group.turnRange.start} – T{group.turnRange.end}
                        </Badge>
                      ) : null}
                    </Stack>
                  }
                >
                  <Stack direction="column" align="stretch" gap="xs" fullWidth>
                    {group.metaSummary ? (
                      <Text
                        as="p"
                        size="xs"
                        tone="secondary"
                        leading="relaxed"
                        italic
                      >
                        {group.metaSummary}
                      </Text>
                    ) : null}

                    {group.events.map((e) => {
                      const isHigh = e.importance >= 4 && e.importance < 5;
                      const isCritical = e.importance >= 5;
                      return (
                        <Card
                          key={e.id}
                          variant="elevated"
                          padding="sm"
                          layout="column"
                          fullWidth
                        >
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
                              gap="xs"
                              wrap
                            >
                              <Badge
                                variant={
                                  isCritical
                                    ? "danger"
                                    : isHigh
                                      ? "warning"
                                      : "accent"
                                }
                                size="xs"
                              >
                                T{e.turn}
                              </Badge>
                              <Badge variant="outline" size="xs">
                                {e.type}
                              </Badge>
                            </Stack>
                            {renderStars(e.importance)}
                          </Stack>
                          <Text
                            as="p"
                            size="xs"
                            tone="secondary"
                            leading="snug"
                          >
                            {e.summary}
                          </Text>
                        </Card>
                      );
                    })}
                  </Stack>
                </Accordion>
              );
            })}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
