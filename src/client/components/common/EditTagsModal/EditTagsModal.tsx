import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listProviderConnections,
  setTagTextProvider,
  type ProviderRegistry,
} from "../../../api";
import {
  PLAYTHROUGH_BUILT_IN_CATEGORIES,
  SUGGESTED_PLAYTHROUGH_TAGS_BY_CATEGORY,
  canonicalizePlaythroughTag,
  sortPlaythroughTags,
} from "../../../../engine/playthroughTagTaxonomy";
import {
  cleanTag,
  resolveTagStyle,
  sortTags,
  type TagTaxonomyConfig,
} from "../../../../engine/tagTaxonomy";
import {
  Badge,
  Button,
  Card,
  CheckboxRow,
  FormGrid,
  Header,
  Icon,
  Modal,
  SearchBar,
  Separator,
  SimpleSelect,
  Stack,
  StatusMessage,
  Tabs,
  TagChip,
  TagInput,
  Text,
  TextInput,
  type IconName,
} from "../../base";

export type EditTagsAiContextOption = {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  defaultChecked?: boolean;
};

export type EditTagsAiSuggestParams = {
  providerId?: string;
  currentTags: string[];
  guidance?: string;
  selectedContext: Record<string, boolean>;
  signal: AbortSignal;
};

export type EditTagsModalProps = {
  entityName: string;
  taxonomy: "playthrough" | "character";
  userConfig?: TagTaxonomyConfig | null;
  initialTags: string[];
  /** Optional original tags (e.g. original imported CCv2 tags) that can be restored via a quick button. */
  originalTags?: string[];
  restoreOriginalLabel?: string;
  libraryTags: string[];
  busy: boolean;
  error: string | null;
  subtitle?: string;
  aiDescription?: string;
  guidancePlaceholder?: string;
  contextOptions: EditTagsAiContextOption[];
  onSuggestAiTags: (params: EditTagsAiSuggestParams) => Promise<string[]>;
  onSave: (tags: string[]) => void;
  onClose: () => void;
};

type StagedAiTagResult = {
  added: string[];
  kept: string[];
  removed: string[];
};

type CharacterBrowserTab = "all" | "species_theme" | "identity" | "general";

const STARTER_CHARACTER_TAGS: readonly string[] = [
  "rating:sfw",
  "rating:nsfw",
  "species:human",
  "species:elf",
  "species:demon",
  "species:android",
  "species:vampire",
  "species:kemonomimi",
  "theme:fantasy",
  "theme:sci-fi",
  "theme:modern",
  "theme:dark_fantasy",
  "role:companion",
  "role:rival",
  "role:mentor",
  "class:warrior",
  "class:mage",
  "class:rogue",
  "female",
  "male",
  "non-binary",
  "royalty",
  "magic",
];

export function EditTagsModal({
  entityName,
  taxonomy,
  userConfig,
  initialTags,
  originalTags,
  restoreOriginalLabel = "Restore CCv2 Tags",
  libraryTags,
  busy,
  error,
  subtitle,
  aiDescription,
  guidancePlaceholder,
  contextOptions,
  onSuggestAiTags,
  onSave,
  onClose,
}: EditTagsModalProps) {
  const canonicalize = useCallback(
    (raw: string): string =>
      taxonomy === "playthrough"
        ? canonicalizePlaythroughTag(raw)
        : cleanTag(raw),
    [taxonomy],
  );

  const normalizeList = useCallback(
    (tags: string[]): string[] =>
      taxonomy === "playthrough"
        ? sortPlaythroughTags(tags)
        : sortTags(tags, userConfig),
    [taxonomy, userConfig],
  );

  const [draftTags, setDraftTags] = useState<string[]>(() =>
    normalizeList(initialTags),
  );
  const [playthroughCategory, setPlaythroughCategory] = useState<
    "theme" | "setting" | "trope"
  >("theme");
  const [characterCategory, setCharacterCategory] =
    useState<CharacterBrowserTab>("all");
  const [filterQuery, setFilterQuery] = useState("");

  // AI Tagging state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [providerRegistry, setProviderRegistry] =
    useState<ProviderRegistry | null>(null);
  const [selectedContext, setSelectedContext] = useState<
    Record<string, boolean>
  >(() => {
    const init: Record<string, boolean> = {};
    for (const opt of contextOptions) {
      init[opt.id] = opt.defaultChecked ?? true;
    }
    return init;
  });
  const [aiGuidance, setAiGuidance] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [stagedAi, setStagedAi] = useState<StagedAiTagResult | null>(null);
  const [stagedSelectedSet, setStagedSelectedSet] = useState<Set<string>>(
    () => new Set(),
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!aiPanelOpen || providerRegistry) return;
    listProviderConnections()
      .then(setProviderRegistry)
      .catch(() => {
        // Non-fatal; falls back to server-side provider resolution
      });
  }, [aiPanelOpen, providerRegistry]);

  const textConnections = useMemo(
    () =>
      (providerRegistry?.connections ?? []).filter((c) => c.kind === "text"),
    [providerRegistry],
  );

  const activeTextProvider = useMemo(
    () =>
      textConnections.find(
        (c) => c.id === providerRegistry?.activeTextProviderId,
      ),
    [textConnections, providerRegistry?.activeTextProviderId],
  );

  const tagProviderOptions = useMemo(
    () => [
      {
        value: "",
        label: activeTextProvider
          ? `Follow active (${activeTextProvider.label})`
          : "Follow active text provider",
      },
      ...textConnections.map((c) => ({ value: c.id, label: c.label })),
    ],
    [textConnections, activeTextProvider],
  );

  const selectedTagProviderId = providerRegistry?.tagTextProviderId ?? "";

  function handleTagProviderOverrideChange(nextId: string) {
    const normalized = nextId || null;
    setProviderRegistry((prev) =>
      prev ? { ...prev, tagTextProviderId: normalized } : prev,
    );
    void setTagTextProvider(normalized)
      .then(setProviderRegistry)
      .catch((err) => {
        setAiError(err instanceof Error ? err.message : String(err));
      });
  }

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const activeSet = useMemo(
    () => new Set(draftTags.map((t) => canonicalize(t))),
    [draftTags, canonicalize],
  );

  const normalizedOriginalTags = useMemo(
    () =>
      originalTags && originalTags.length > 0
        ? normalizeList(originalTags)
        : [],
    [originalTags, normalizeList],
  );

  const isOriginalSameAsDraft = useMemo(() => {
    if (normalizedOriginalTags.length === 0) return true;
    if (normalizedOriginalTags.length !== draftTags.length) return false;
    return normalizedOriginalTags.every((t, idx) => t === draftTags[idx]);
  }, [normalizedOriginalTags, draftTags]);

  function toggleSuggestedTag(tag: string) {
    const norm = canonicalize(tag);
    if (!norm) return;
    setDraftTags((prev) => {
      const exists = prev.some((t) => canonicalize(t) === norm);
      const next = exists
        ? prev.filter((t) => canonicalize(t) !== norm)
        : [...prev, norm];
      return normalizeList(next);
    });
  }

  async function handleGenerateAiTags() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAiLoading(true);
    setAiError(null);

    try {
      const rawTags = await onSuggestAiTags({
        providerId: selectedTagProviderId || undefined,
        currentTags: draftTags,
        guidance: aiGuidance.trim() || undefined,
        selectedContext,
        signal: controller.signal,
      });

      const normalizedSuggestions = Array.from(
        new Set(rawTags.map((t) => canonicalize(t)).filter(Boolean)),
      );
      const suggestedSet = new Set(normalizedSuggestions);
      const currentNormalized = draftTags
        .map((t) => canonicalize(t))
        .filter(Boolean);
      const currentSet = new Set(currentNormalized);

      const added = normalizeList(
        normalizedSuggestions.filter((t) => !currentSet.has(t)),
      );
      const kept = normalizeList(
        currentNormalized.filter((t) => suggestedSet.has(t)),
      );
      const removed = normalizeList(
        currentNormalized.filter((t) => !suggestedSet.has(t)),
      );

      setStagedAi({ added, kept, removed });
      // Default selection: all new additions + confirmed existing tags checked; suggested removals unchecked
      setStagedSelectedSet(new Set([...added, ...kept]));
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("abort")) {
        setAiError(msg);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setAiLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  function handleCancelAiRequest() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setAiLoading(false);
  }

  function toggleStagedTag(tag: string) {
    const norm = canonicalize(tag);
    if (!norm) return;
    setStagedSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(norm)) {
        next.delete(norm);
      } else {
        next.add(norm);
      }
      return next;
    });
  }

  function handleRevertStagedAi() {
    setStagedAi(null);
    setStagedSelectedSet(new Set());
    setAiError(null);
  }

  function handleApplyStagedToDraft() {
    if (!stagedAi) return;
    const nextTags = normalizeList(Array.from(stagedSelectedSet));
    setDraftTags(nextTags);
    setStagedAi(null);
    setStagedSelectedSet(new Set());
  }

  function handleSaveAndApplyStaged() {
    if (!stagedAi) return;
    const nextTags = normalizeList(Array.from(stagedSelectedSet));
    setDraftTags(nextTags);
    onSave(nextTags);
  }

  const categorySuggestions = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const normQ = cleanTag(q);

    if (taxonomy === "playthrough") {
      const rawList =
        SUGGESTED_PLAYTHROUGH_TAGS_BY_CATEGORY[playthroughCategory];
      if (!q) return rawList;
      return rawList.filter(
        (t) => t.includes(q) || (normQ && cleanTag(t).includes(normQ)),
      );
    }

    // Character taxonomy pool: combine libraryTags + originalTags + starter tags
    const pool = normalizeList([
      ...libraryTags,
      ...(originalTags ?? []),
      ...STARTER_CHARACTER_TAGS,
    ]);

    const filteredByTab = pool.filter((tag) => {
      if (characterCategory === "all") return true;
      const catId = resolveTagStyle(tag, userConfig).categoryId;
      if (characterCategory === "species_theme") {
        return catId === "species" || catId === "theme";
      }
      if (characterCategory === "identity") {
        return (
          catId === "rating_sfw" ||
          catId === "rating_nsfw" ||
          catId === "copyright" ||
          catId === "character" ||
          catId === "artist" ||
          catId === "meta"
        );
      }
      return (
        catId !== "species" &&
        catId !== "theme" &&
        catId !== "rating_sfw" &&
        catId !== "rating_nsfw" &&
        catId !== "copyright" &&
        catId !== "character" &&
        catId !== "artist" &&
        catId !== "meta"
      );
    });

    if (!q) return filteredByTab;
    return filteredByTab.filter(
      (t) => t.includes(q) || (normQ && cleanTag(t).includes(normQ)),
    );
  }, [
    taxonomy,
    playthroughCategory,
    characterCategory,
    filterQuery,
    libraryTags,
    originalTags,
    normalizeList,
    userConfig,
  ]);

  const categoryDescription = useMemo(() => {
    if (taxonomy === "playthrough") {
      return PLAYTHROUGH_BUILT_IN_CATEGORIES.find(
        (c) => c.id === playthroughCategory,
      )?.description;
    }
    switch (characterCategory) {
      case "all":
        return "Click any tag from your Character Library or built-in starter set to toggle it on this character.";
      case "species_theme":
        return "Species, fantasy races, RPG classes, roles, archetypes, and genre themes (e.g. species:elf, class:mage, theme:fantasy).";
      case "identity":
        return "Content ratings, franchises, series origins, named identities, and creators (e.g. rating:sfw, series:touhou).";
      case "general":
        return "Personality traits, physical attributes, and custom descriptive tags.";
    }
  }, [taxonomy, playthroughCategory, characterCategory]);

  const defaultSubtitle =
    taxonomy === "playthrough"
      ? "Assign themes, settings, tropes, or use AI to analyze the story and suggest tags."
      : "Assign character traits, species, themes, or use AI to analyze the character card and suggest tags.";

  const defaultAiDescription =
    taxonomy === "playthrough"
      ? "Choose which story context the AI should review to suggest relevant Theme, Setting, and Trope tags (and flag any irrelevant existing tags for removal)."
      : "Choose which character card fields the AI should review to suggest canonical BobbinLoom tags (and flag noisy or redundant tags for removal).";

  const defaultGuidancePlaceholder =
    taxonomy === "playthrough"
      ? "e.g. Focus on dark fantasy themes, or invent new setting tags for the floating city…"
      : "e.g. Focus on personality and RPG class tags, or keep franchise tags…";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      fullScreenMobile
      ariaLabel={`Edit tags for ${entityName}`}
    >
      <Header
        variant="section"
        icon="Tag"
        title={`Edit Tags — ${entityName}`}
        subtitle={subtitle ?? defaultSubtitle}
        actions={
          <Button
            variant={aiPanelOpen ? "primary" : "secondary"}
            size="sm"
            leftIcon="Sparkles"
            disabled={busy}
            onClick={() => setAiPanelOpen((v) => !v)}
          >
            {aiPanelOpen ? "Hide AI Tagger" : "Edit Tags with AI"}
          </Button>
        }
      />
      <Modal.Body>
        <Modal.Content>
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            {error ? (
              <StatusMessage variant="banner" tone="err">
                {error}
              </StatusMessage>
            ) : null}

            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="xs"
                wrap
                fullWidth
              >
                <Text size="xs" weight="semibold" tone="secondary">
                  Assigned Tags ({draftTags.length})
                </Text>
                <Stack direction="row" align="center" gap="xs" wrap>
                  {normalizedOriginalTags.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon="RotateCcw"
                      disabled={busy || aiLoading || isOriginalSameAsDraft}
                      onClick={() => setDraftTags(normalizedOriginalTags)}
                      title={`Restore original imported tags (${normalizedOriginalTags.join(", ")})`}
                    >
                      {restoreOriginalLabel}
                    </Button>
                  ) : null}
                  {draftTags.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy || aiLoading}
                      onClick={() => setDraftTags([])}
                    >
                      Clear All
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
              <TagInput
                value={draftTags}
                onChange={(next) => setDraftTags(normalizeList(next))}
                taxonomy={taxonomy}
                userConfig={userConfig}
                disabled={busy || aiLoading}
                placeholder={
                  taxonomy === "playthrough"
                    ? "Type a tag (e.g. horror, workplace, femdom, theme:noir) and press Enter…"
                    : "Type a tag (e.g. species:elf, class:mage, rating:sfw, tsundere) and press Enter…"
                }
              />
              {taxonomy === "playthrough" ? (
                <Text size="xs" tone="muted">
                  Tip: Built-in keywords automatically color-code into Theme,
                  Setting, or Trope. You can also prefix custom tags with{" "}
                  <code>theme:</code>, <code>setting:</code>, or{" "}
                  <code>trope:</code>.
                </Text>
              ) : (
                <Text size="xs" tone="muted">
                  Tip: Use prefixes like <code>species:</code>,{" "}
                  <code>theme:</code>, <code>class:</code>, <code>series:</code>
                  , or <code>rating:</code> to automatically organize and
                  color-code character tags.
                </Text>
              )}
            </Stack>

            {aiPanelOpen ? (
              <Card variant="elevated" padding="md" fullWidth>
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    wrap
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs">
                      <Icon
                        name="Sparkles"
                        size={15}
                        className="ds-icon-accent"
                      />
                      <Text size="sm" weight="semibold">
                        Edit Tags with AI
                      </Text>
                    </Stack>
                    <Badge variant="outline" size="xs">
                      Uses Built-in + Shelf Taxonomy
                    </Badge>
                  </Stack>

                  <Text size="xs" tone="secondary">
                    {aiDescription ?? defaultAiDescription}
                  </Text>

                  <SimpleSelect
                    label="AI Tagging Provider"
                    labelIcon="Sliders"
                    size="sm"
                    variant="filled"
                    fullWidth
                    value={selectedTagProviderId}
                    options={tagProviderOptions}
                    disabled={aiLoading || busy || textConnections.length === 0}
                    onChange={handleTagProviderOverrideChange}
                    aria-label="AI Tagging Provider Override"
                  />

                  {contextOptions.length > 0 ? (
                    <FormGrid cols={2} gap="xs">
                      {contextOptions.map((opt) => (
                        <CheckboxRow
                          key={opt.id}
                          icon={opt.icon}
                          title={opt.title}
                          description={opt.description}
                          checked={Boolean(selectedContext[opt.id])}
                          disabled={aiLoading || busy}
                          onChange={(e) =>
                            setSelectedContext((prev) => ({
                              ...prev,
                              [opt.id]: e.target.checked,
                            }))
                          }
                        />
                      ))}
                    </FormGrid>
                  ) : null}

                  <TextInput
                    label="Custom Focus / Guidance (Optional)"
                    labelIcon="Compass"
                    size="sm"
                    value={aiGuidance}
                    onChange={(e) => setAiGuidance(e.target.value)}
                    disabled={aiLoading || busy}
                    placeholder={
                      guidancePlaceholder ?? defaultGuidancePlaceholder
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !aiLoading && !busy) {
                        e.preventDefault();
                        void handleGenerateAiTags();
                      }
                    }}
                    rightElement={
                      <Stack direction="row" align="center" gap="xs">
                        {aiLoading ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="X"
                            onClick={handleCancelAiRequest}
                          >
                            Stop
                          </Button>
                        ) : null}
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon="Sparkles"
                          isLoading={aiLoading}
                          disabled={busy}
                          onClick={() => void handleGenerateAiTags()}
                        >
                          {stagedAi ? "Regenerate" : "Suggest Tags"}
                        </Button>
                      </Stack>
                    }
                  />

                  {aiError ? (
                    <StatusMessage
                      variant="banner"
                      tone="err"
                      onDismiss={() => setAiError(null)}
                    >
                      {aiError}
                    </StatusMessage>
                  ) : null}

                  {stagedAi ? (
                    <Card variant="panel" padding="sm" fullWidth>
                      <Stack
                        direction="column"
                        align="stretch"
                        gap="sm"
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
                            <Badge variant="accent" size="xs" leftIcon="Check">
                              Staging Area ({stagedSelectedSet.size} selected)
                            </Badge>
                            <Text size="xs" tone="secondary">
                              Click any tag chip below to toggle whether it will
                              be kept or applied.
                            </Text>
                          </Stack>

                          <Stack direction="row" align="center" gap="xs" wrap>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() =>
                                setStagedSelectedSet(
                                  new Set([
                                    ...stagedAi.added,
                                    ...stagedAi.kept,
                                    ...stagedAi.removed,
                                  ]),
                                )
                              }
                            >
                              Select All
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() => setStagedSelectedSet(new Set())}
                            >
                              Deselect All
                            </Button>
                          </Stack>
                        </Stack>

                        {stagedAi.added.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="primary">
                              + New AI Suggestions ({stagedAi.added.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.added.map((tag) => (
                                <TagChip
                                  key={`add-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy={taxonomy}
                                  userConfig={userConfig}
                                  active={stagedSelectedSet.has(
                                    canonicalize(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        {stagedAi.kept.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="secondary">
                              ✓ Confirmed Existing Tags ({stagedAi.kept.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.kept.map((tag) => (
                                <TagChip
                                  key={`keep-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy={taxonomy}
                                  userConfig={userConfig}
                                  active={stagedSelectedSet.has(
                                    canonicalize(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        {stagedAi.removed.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="warning">
                              − Suggested Removals (Unchecked = Remove, Click to
                              Keep) ({stagedAi.removed.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.removed.map((tag) => (
                                <TagChip
                                  key={`rem-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy={taxonomy}
                                  userConfig={userConfig}
                                  active={stagedSelectedSet.has(
                                    canonicalize(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        <Separator spacing="none" />

                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          wrap
                          fullWidth
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="RotateCcw"
                            disabled={busy}
                            onClick={handleRevertStagedAi}
                          >
                            Cancel / Revert
                          </Button>
                          <Stack direction="row" align="center" gap="xs" wrap>
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon="Check"
                              disabled={busy}
                              onClick={handleApplyStagedToDraft}
                            >
                              Apply to Draft
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon="Sparkles"
                              isLoading={busy}
                              onClick={handleSaveAndApplyStaged}
                            >
                              Save & Apply ({stagedSelectedSet.size})
                            </Button>
                          </Stack>
                        </Stack>
                      </Stack>
                    </Card>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            <Separator spacing="none" />

            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                fullWidth
                stackBelow="sm"
              >
                {taxonomy === "playthrough" ? (
                  <Tabs<"theme" | "setting" | "trope">
                    variant="segmented"
                    size="sm"
                    fullWidth
                    activeTab={playthroughCategory}
                    onChange={setPlaythroughCategory}
                    tabs={[
                      { id: "theme", label: "Theme & Genre" },
                      { id: "setting", label: "Setting & Backdrop" },
                      { id: "trope", label: "Tropes & Dynamics" },
                    ]}
                  />
                ) : (
                  <Tabs<CharacterBrowserTab>
                    variant="segmented"
                    size="sm"
                    fullWidth
                    activeTab={characterCategory}
                    onChange={setCharacterCategory}
                    tabs={[
                      { id: "all", label: "All Tags" },
                      { id: "species_theme", label: "Species & Theme" },
                      { id: "identity", label: "Rating & Origin" },
                      { id: "general", label: "General Traits" },
                    ]}
                  />
                )}
                <SearchBar
                  size="sm"
                  flex1
                  value={filterQuery}
                  onChange={setFilterQuery}
                  placeholder="Filter suggestions…"
                  aria-label="Filter suggested tags"
                />
              </Stack>

              {categoryDescription ? (
                <Text size="xs" tone="muted">
                  {categoryDescription}
                </Text>
              ) : null}

              <Card variant="elevated" padding="sm" fullWidth>
                <Stack
                  direction="row"
                  align="center"
                  gap="xs"
                  wrap
                  scrollable
                  fullWidth
                >
                  {categorySuggestions.length === 0 ? (
                    <Text size="xs" tone="muted">
                      No tags match &ldquo;{filterQuery}&rdquo;. Press Enter in
                      the field above to add it as a custom tag.
                    </Text>
                  ) : (
                    categorySuggestions.map((tag) => (
                      <TagChip
                        key={tag}
                        tag={tag}
                        size="sm"
                        taxonomy={taxonomy}
                        userConfig={userConfig}
                        active={activeSet.has(canonicalize(tag))}
                        disabled={busy}
                        onClick={() => toggleSuggestedTag(tag)}
                      />
                    ))
                  )}
                </Stack>
              </Card>
            </Stack>
          </Stack>
        </Modal.Content>
      </Modal.Body>
      <Modal.Footer>
        <Stack direction="row" align="center" justify="end" gap="sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            onClick={() => onSave(draftTags)}
          >
            Save Tags
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
