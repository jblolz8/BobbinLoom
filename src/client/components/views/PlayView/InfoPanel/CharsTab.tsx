import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CharacterInstance,
  CharacterTemplate,
  CharacterContextScope,
  Playthrough,
} from "../../../../../schemas";
import {
  buildImageUrl,
  editCharacter,
  generateCharacterPortrait,
  getCharacterAvatarUrl,
  listCharacters,
  fleshOutCharacter,
  generatePlaythroughCharacter,
  saveCharacterToLibrary,
} from "../../../../api";
import {
  listProviderConnections,
  setCharacterTextProvider,
  type ProviderConnection,
} from "../../../../api/providers";
import type { CharacterEditPayload } from "../../../../api";
import {
  CAST_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveCastPreferences,
  updateViewPreferences,
} from "../../../../api";
import { DetailedCharacterEditor } from "./DetailedCharacterEditor";
import { SimpleCharacterEditor } from "./SimpleCharacterEditor";
import { CharacterPortraitModal } from "./CharacterPortraitModal";
import { CharacterSheetSections } from "./CharacterSheetSections";
import {
  Accordion,
  AvatarBadge,
  Badge,
  Button,
  Card,
  CharacterAvatar,
  Checkbox,
  CheckboxRow,
  FormGrid,
  Icon,
  ModelIcon,
  resolveModelInfo,
  SearchBar,
  Separator,
  SimpleSelect,
  Stack,
  StatusMessage,
  Tabs,
  Text,
  TextArea,
  TextInput,
  type SimpleSelectOption,
} from "../../../base";
import { ConfirmModal } from "../../../common";

type SaveFeedback = { ok: boolean; text: string };

export type CharsTabProps = {
  playthrough: Playthrough;
  onPlaythroughChange: (
    p: Playthrough | ((prev: Playthrough) => Playthrough),
  ) => void;
  onOpenLibrary?: (templateId: string) => void;
  imagePromptPreview?: boolean;
};

export type CastViewMode = "portrait" | "compact";

export function CharsTab({
  playthrough,
  onPlaythroughChange,
  onOpenLibrary,
  imagePromptPreview = true,
}: CharsTabProps) {
  const [library, setLibrary] = useState<CharacterTemplate[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<
    Record<string, SaveFeedback>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingChar, setEditingChar] = useState<CharacterInstance | null>(
    null,
  );
  const [portraitModalChar, setPortraitModalChar] =
    useState<CharacterInstance | null>(null);
  const [confirmUpdateLibChar, setConfirmUpdateLibChar] =
    useState<CharacterInstance | null>(null);
  const [overwriteLibPortrait, setOverwriteLibPortrait] = useState(false);
  const [fleshingOutId, setFleshingOutId] = useState<string | null>(null);
  const fleshOutAbortRef = useRef<AbortController | null>(null);
  const [fleshOutError, setFleshOutError] = useState<string | null>(null);
  const [generatingPortraitIds, setGeneratingPortraitIds] = useState<
    Record<string, boolean>
  >({});
  const portraitAbortRefs = useRef<Record<string, AbortController>>({});
  const [textConnections, setTextConnections] = useState<ProviderConnection[]>(
    [],
  );
  const [activeTextProviderId, setActiveTextProviderId] = useState("");
  const [characterProviderId, setCharacterProviderId] = useState("");
  const [charSearch, setCharSearch] = useState("");
  const [offScreenCollapsed, setOffScreenCollapsed] = useState(false);
  const [castViewMode, setCastViewModeState] = useState<CastViewMode>(
    CAST_PREFERENCE_DEFAULTS.viewMode,
  );
  const [contextScope, setContextScopeState] = useState<CharacterContextScope>(
    CAST_PREFERENCE_DEFAULTS.contextScope,
  );
  const [recentCount, setRecentCountState] = useState<number>(
    CAST_PREFERENCE_DEFAULTS.recentCount,
  );

  // New character generation modal state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genTier, setGenTier] = useState<"simple" | "detailed">("detailed");
  const [genInScene, setGenInScene] = useState(true);
  const [isGeneratingChar, setIsGeneratingChar] = useState(false);
  const [generateCharError, setGenerateCharError] = useState<string | null>(
    null,
  );
  const genAbortRef = useRef<AbortController | null>(null);

  /** Set the moment the reader picks a mode, so the read that lands after the first paint never
   *  overwrites what they just chose. */
  const castTouchedRef = useRef(false);

  const setCastViewMode = (mode: CastViewMode) => {
    castTouchedRef.current = true;
    setCastViewModeState(mode);
    void updateViewPreferences({ cast: { viewMode: mode } }).catch(() => {
      /* The next read reconciles; a failed write must not break the control. */
    });
  };

  const setContextScope = (scope: CharacterContextScope) => {
    castTouchedRef.current = true;
    setContextScopeState(scope);
    void updateViewPreferences({ cast: { contextScope: scope } }).catch(
      () => {},
    );
  };

  const setRecentCount = (count: number) => {
    castTouchedRef.current = true;
    const clamped = Math.max(1, Math.min(50, count));
    setRecentCountState(clamped);
    void updateViewPreferences({ cast: { recentCount: clamped } }).catch(
      () => {},
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled || castTouchedRef.current) return;
      const resolved = resolveCastPreferences(preferences);
      setCastViewModeState(resolved.viewMode);
      setContextScopeState(resolved.contextScope);
      setRecentCountState(resolved.recentCount);
    })().catch(() => {
      /* A failed read leaves the default; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listCharacters()
      .then(setLibrary)
      .catch(() => {
        /* library membership is cosmetic */
      });
  }, []);

  async function handleSave(
    characterId: string,
    mode: "update" | "newVersion",
    overwritePortrait?: boolean,
  ) {
    setSavingId(characterId);
    try {
      const result = await saveCharacterToLibrary(
        playthrough.id,
        characterId,
        mode,
        overwritePortrait,
      );
      setLibrary(await listCharacters());
      const text =
        mode === "newVersion"
          ? `✓ Saved as v${result.template.version}`
          : result.created
            ? "✓ Saved to library"
            : "✓ Library updated";
      setSaveFeedback((f) => ({ ...f, [characterId]: { ok: true, text } }));
      setTimeout(() => {
        setSaveFeedback((f) => {
          const next = { ...f };
          delete next[characterId];
          return next;
        });
      }, 4000);
    } catch (e) {
      setSaveFeedback((f) => ({
        ...f,
        [characterId]: {
          ok: false,
          text: e instanceof Error ? e.message : String(e),
        },
      }));
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listProviderConnections()
      .then((reg) => {
        if (cancelled) return;
        setTextConnections(reg.connections.filter((c) => c.kind === "text"));
        setActiveTextProviderId(reg.activeTextProviderId ?? "");
        setCharacterProviderId(reg.characterTextProviderId ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCharacterProviderChange(id: string) {
    setCharacterProviderId(id);
    setCharacterTextProvider(id === "" ? null : id).catch((e: unknown) => {
      console.warn("Failed to set character text provider", e);
    });
  }

  const characterProviderOptions = useMemo<SimpleSelectOption<string>[]>(() => {
    const activeConn = textConnections.find(
      (c) => c.id === activeTextProviderId,
    );
    const activeDesc = activeConn
      ? `${activeConn.label}${activeConn.model ? ` (${activeConn.model})` : ""}`
      : "Follows active story connection";

    const defaultOpt: SimpleSelectOption<string> = {
      value: "",
      label: "Current active text provider",
      description: activeDesc,
      icon: activeConn?.model ? (
        <ModelIcon
          family={resolveModelInfo(activeConn.model).family}
          size={14}
        />
      ) : (
        <Icon name="Cpu" size={14} />
      ),
    };

    const rows: SimpleSelectOption<string>[] = textConnections.map((c) => ({
      value: c.id,
      label: `${c.label}${c.id === activeTextProviderId ? " (active)" : ""}`,
      description: c.model || undefined,
      icon: <ModelIcon family={resolveModelInfo(c.model).family} size={14} />,
    }));

    if (
      characterProviderId &&
      !textConnections.some((c) => c.id === characterProviderId)
    ) {
      rows.push({
        value: characterProviderId,
        label: `${characterProviderId} (not found)`,
        icon: <Icon name="AlertTriangle" size={14} />,
      });
    }

    return [defaultOpt, ...rows];
  }, [textConnections, activeTextProviderId, characterProviderId]);

  const contextScopeOptions = useMemo<
    SimpleSelectOption<CharacterContextScope>[]
  >(
    () => [
      {
        value: "chapter",
        label: "Current Chapter (All)",
        description: "Full dialogue & events from active chapter",
        icon: <Icon name="BookOpen" size={13} />,
      },
      {
        value: "timeline",
        label: "Timeline Highlights",
        description: "Key milestone summaries from story timeline",
        icon: <Icon name="Clock" size={13} />,
      },
      {
        value: "recent",
        label: "Recent Messages",
        description: `Last ${recentCount} messages of dialogue`,
        icon: <Icon name="MessageSquare" size={13} />,
      },
    ],
    [recentCount],
  );

  async function handleFleshOut(characterId: string) {
    fleshOutAbortRef.current?.abort();
    const controller = new AbortController();
    fleshOutAbortRef.current = controller;
    setFleshingOutId(characterId);
    setFleshOutError(null);
    try {
      const updated = await fleshOutCharacter(
        playthrough.id,
        characterId,
        { scope: contextScope, recentCount },
        controller.signal,
      );
      if (fleshOutAbortRef.current === controller) {
        onPlaythroughChange(updated);
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        fleshOutAbortRef.current === controller
      ) {
        setFleshOutError(
          e instanceof Error ? e.message : "Fleshing out character failed",
        );
      }
    } finally {
      if (fleshOutAbortRef.current === controller) {
        fleshOutAbortRef.current = null;
        setFleshingOutId(null);
      }
    }
  }

  function handleCancelFleshOut() {
    fleshOutAbortRef.current?.abort();
    fleshOutAbortRef.current = null;
    setFleshingOutId(null);
  }

  useEffect(() => {
    return () => {
      for (const ctrl of Object.values(portraitAbortRefs.current)) {
        ctrl.abort();
      }
      portraitAbortRefs.current = {};
    };
  }, [playthrough.id]);

  async function handleQuickGeneratePortrait(characterId: string) {
    portraitAbortRefs.current[characterId]?.abort();
    const controller = new AbortController();
    portraitAbortRefs.current[characterId] = controller;
    setGeneratingPortraitIds((prev) => ({ ...prev, [characterId]: true }));
    setSaveFeedback((prev) => {
      const next = { ...prev };
      delete next[characterId];
      return next;
    });

    try {
      const res = await generateCharacterPortrait(playthrough.id, characterId, {
        signal: controller.signal,
      });
      if (portraitAbortRefs.current[characterId] === controller) {
        onPlaythroughChange((prev) => {
          if (prev.id !== res.playthrough.id) return prev;
          const updatedChar = res.playthrough.characters.find(
            (c) => c.id === characterId,
          );
          if (!updatedChar) return res.playthrough;
          return {
            ...prev,
            characters: prev.characters.map((c) =>
              c.id === characterId
                ? {
                    ...c,
                    avatarFile: updatedChar.avatarFile,
                    avatars: updatedChar.avatars,
                  }
                : c,
            ),
            ...(res.playthrough.snapshots
              ? {
                  snapshots: Object.fromEntries(
                    Object.entries(prev.snapshots ?? {}).map(
                      ([msgId, snap]) => {
                        const resSnapChar = res.playthrough.snapshots?.[
                          msgId
                        ]?.characters.find((c) => c.id === characterId);
                        if (!resSnapChar) return [msgId, snap];
                        return [
                          msgId,
                          {
                            ...snap,
                            characters: snap.characters.map((c) =>
                              c.id === characterId
                                ? {
                                    ...c,
                                    avatarFile: resSnapChar.avatarFile,
                                    avatars: resSnapChar.avatars,
                                  }
                                : c,
                            ),
                          },
                        ];
                      },
                    ),
                  ),
                }
              : {}),
          };
        });
        setSaveFeedback((f) => ({
          ...f,
          [characterId]: { ok: true, text: "✓ Portrait generated" },
        }));
        setTimeout(() => {
          setSaveFeedback((f) => {
            const next = { ...f };
            delete next[characterId];
            return next;
          });
        }, 4000);
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        portraitAbortRefs.current[characterId] === controller
      ) {
        setSaveFeedback((f) => ({
          ...f,
          [characterId]: {
            ok: false,
            text: e instanceof Error ? e.message : "Portrait generation failed",
          },
        }));
      }
    } finally {
      if (portraitAbortRefs.current[characterId] === controller) {
        delete portraitAbortRefs.current[characterId];
        setGeneratingPortraitIds((prev) => {
          const next = { ...prev };
          delete next[characterId];
          return next;
        });
      }
    }
  }

  function handleCancelQuickPortrait(characterId: string) {
    portraitAbortRefs.current[characterId]?.abort();
    delete portraitAbortRefs.current[characterId];
    setGeneratingPortraitIds((prev) => {
      const next = { ...prev };
      delete next[characterId];
      return next;
    });
  }

  async function handleGenerateCharacter() {
    setIsGeneratingChar(true);
    setGenerateCharError(null);
    genAbortRef.current?.abort();
    const controller = new AbortController();
    genAbortRef.current = controller;

    try {
      const res = await generatePlaythroughCharacter(
        playthrough.id,
        {
          prompt: genPrompt.trim() || undefined,
          tier: genTier,
          inScene: genInScene,
          scope: contextScope,
          recentCount,
        },
        controller.signal,
      );
      if (genAbortRef.current === controller) {
        onPlaythroughChange(res.state);
        setGenerateModalOpen(false);
        setGenPrompt("");
      }
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        genAbortRef.current === controller
      ) {
        setGenerateCharError(
          e instanceof Error ? e.message : "Failed to generate character",
        );
      }
    } finally {
      if (genAbortRef.current === controller) {
        genAbortRef.current = null;
        setIsGeneratingChar(false);
      }
    }
  }

  function handleCancelGenerate() {
    genAbortRef.current?.abort();
    genAbortRef.current = null;
    setIsGeneratingChar(false);
    setGenerateModalOpen(false);
    setGenerateCharError(null);
  }

  async function handleEditSave(payload: CharacterEditPayload) {
    if (!editingChar) return;
    const updated = await editCharacter(
      playthrough.id,
      editingChar.id,
      payload,
    );
    onPlaythroughChange(updated);
  }

  async function handleEditorSaveToLibrary(
    mode: "update" | "newVersion",
    overwritePortrait?: boolean,
  ) {
    if (!editingChar) throw new Error("No character being edited");
    const result = await saveCharacterToLibrary(
      playthrough.id,
      editingChar.id,
      mode,
      overwritePortrait,
    );
    setLibrary(await listCharacters());
    return { version: result.template.version, created: result.created };
  }

  const activeCharIds = useMemo(
    () => new Set(playthrough.activeCharacters ?? []),
    [playthrough.activeCharacters],
  );

  const filterFn = (c: CharacterInstance) => {
    if (!charSearch.trim()) return true;
    const q = charSearch.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description ? c.description.toLowerCase().includes(q) : false) ||
      (c.storyRole ? c.storyRole.toLowerCase().includes(q) : false) ||
      (c.memorySummary ? c.memorySummary.toLowerCase().includes(q) : false)
    );
  };

  const activeCharacters = useMemo(() => {
    return playthrough.characters
      .filter((c) => activeCharIds.has(c.id))
      .filter(filterFn);
  }, [playthrough.characters, activeCharIds, charSearch]);

  const inactiveCharacters = useMemo(() => {
    return playthrough.characters
      .filter((c) => !activeCharIds.has(c.id))
      .filter(filterFn);
  }, [playthrough.characters, activeCharIds, charSearch]);

  async function handleRemoveCharCondition(
    char: CharacterInstance,
    index: number,
  ) {
    const updatedConditions = char.conditions.filter((_, i) => i !== index);
    const updated = await editCharacter(playthrough.id, char.id, {
      conditions: updatedConditions,
    });
    onPlaythroughChange(updated);
  }

  async function handleRemoveCharFlag(char: CharacterInstance, index: number) {
    const updatedFlags = char.flags.filter((_, i) => i !== index);
    const updated = await editCharacter(playthrough.id, char.id, {
      flags: updatedFlags,
    });
    onPlaythroughChange(updated);
  }

  async function handleTogglePresence(
    character: CharacterInstance,
    currentPresent: boolean,
  ) {
    const updated = await editCharacter(playthrough.id, character.id, {
      inScene: !currentPresent,
    });
    onPlaythroughChange(updated);
  }

  function renderCharacterItem(character: CharacterInstance, inScene: boolean) {
    if (character.templateId) {
      const localTpl = playthrough.characterTemplates.find(
        (t) => t.id === character.templateId,
      );
      const libTpl = library.find((t) => t.id === character.templateId);
      const isCcv2 = localTpl?.format === "ccv2";
      const libraryStale =
        !!localTpl &&
        !!libTpl &&
        JSON.stringify({
          content: localTpl.content,
          summary: localTpl.summary,
          startingClothing: localTpl.startingClothing,
        }) !==
          JSON.stringify({
            content: libTpl.content,
            summary: libTpl.summary,
            startingClothing: libTpl.startingClothing,
          });
      const isInLib = library.some((t) => t.id === character.templateId);
      return (
        <CharacterCard
          key={character.id}
          character={character}
          playthroughId={playthrough.id}
          content={localTpl?.content ?? ""}
          localTemplate={localTpl}
          viewMode={castViewMode}
          inLibrary={isInLib}
          present={inScene}
          libraryStale={libraryStale}
          readOnlySheet={isCcv2}
          feedback={saveFeedback[character.id] ?? null}
          saving={savingId === character.id}
          onSave={(mode) => {
            if (mode === "update" && isInLib && character.avatarFile) {
              setOverwriteLibPortrait(false);
              setConfirmUpdateLibChar(character);
              return;
            }
            void handleSave(character.id, mode);
          }}
          onEdit={() => setEditingChar(character)}
          onOpenPortraitModal={() => setPortraitModalChar(character)}
          isGeneratingPortrait={Boolean(generatingPortraitIds[character.id])}
          onGeneratePortrait={() =>
            void handleQuickGeneratePortrait(character.id)
          }
          onCancelGeneratePortrait={() =>
            handleCancelQuickPortrait(character.id)
          }
          onTogglePresence={() => void handleTogglePresence(character, inScene)}
          onOpenLibrary={onOpenLibrary}
          onRemoveCondition={(i) =>
            void handleRemoveCharCondition(character, i)
          }
          onRemoveFlag={(i) => void handleRemoveCharFlag(character, i)}
        />
      );
    }

    return (
      <SimpleCharacterCard
        key={character.id}
        character={character}
        present={inScene}
        viewMode={castViewMode}
        isFleshingOut={fleshingOutId === character.id}
        onFleshOut={() => void handleFleshOut(character.id)}
        onCancel={handleCancelFleshOut}
        onEdit={() => setEditingChar(character)}
        onTogglePresence={() => void handleTogglePresence(character, inScene)}
        onRemoveCondition={(i) => void handleRemoveCharCondition(character, i)}
        onRemoveFlag={(i) => void handleRemoveCharFlag(character, i)}
      />
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* ── Character Manager Toolbar ── */}
      <Card variant="elevated" padding="sm" layout="column" fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          wrap
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Sparkles" size={14} />
            <Text variant="label" size="xs" weight="semibold">
              Character Manager
            </Text>
          </Stack>
          <Button
            size="xs"
            variant="ai"
            leftIcon="Plus"
            onClick={() => {
              setGenerateCharError(null);
              setGenerateModalOpen(true);
            }}
            title="Generate New Character"
          >
            Generate Character
          </Button>
        </Stack>

        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <SimpleSelect
            id="char-provider-select"
            label="AI Provider"
            size="xs"
            variant="filled"
            fullWidth
            value={characterProviderId}
            onChange={handleCharacterProviderChange}
            options={characterProviderOptions}
            placeholder="Current active text provider"
            aria-label="Character creator AI provider"
          />

          <SimpleSelect
            id="char-scope-select"
            label="Context Scope"
            size="xs"
            variant="filled"
            fullWidth
            value={contextScope}
            onChange={(val) => setContextScope(val as CharacterContextScope)}
            options={contextScopeOptions}
            aria-label="Story context scope for character operations"
          />

          {contextScope === "recent" ? (
            <TextInput
              type="number"
              size="sm"
              min={1}
              max={50}
              label="Recent Messages Count"
              value={recentCount}
              onChange={(e) =>
                setRecentCount(parseInt(e.target.value, 10) || 8)
              }
              aria-label="Number of recent messages"
            />
          ) : null}
        </Stack>
      </Card>

      {fleshOutError ? (
        <StatusMessage
          variant="banner"
          tone="err"
          onDismiss={() => setFleshOutError(null)}
        >
          {fleshOutError}
        </StatusMessage>
      ) : null}

      {/* ── Search & View Mode Toolbar ── */}
      {playthrough.characters.length > 0 ? (
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
              value={charSearch}
              onChange={setCharSearch}
              placeholder="Search characters…"
              size="sm"
            />
          </Stack>
          <Tabs<CastViewMode>
            variant="segmented"
            size="sm"
            ariaLabel="Cast View Mode"
            activeTab={castViewMode}
            onChange={setCastViewMode}
            tabs={[
              {
                id: "portrait",
                label: "Portrait",
                icon: "IdCard",
                title: "Full Portrait View",
              },
              {
                id: "compact",
                label: "Compact",
                icon: "List",
                title: "Compact Profile View",
              },
            ]}
          />
        </Stack>
      ) : null}

      {/* ── 1. In Scene (Active) Section ── */}
      <Stack as="section" direction="column" align="stretch" gap="sm" fullWidth>
        <Stack direction="row" align="center" gap="xs">
          <Icon name="Users" size={14} />
          <Text
            as="h3"
            variant="label"
            size="xs"
            weight="semibold"
            tone="secondary"
            uppercase
          >
            In Scene (Active)
          </Text>
          <Badge variant="success" size="xs" pill>
            {activeCharacters.length}
          </Badge>
        </Stack>

        {activeCharacters.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="Users">
            {charSearch.trim()
              ? `No active characters match "${charSearch}".`
              : "No characters currently in the scene."}
          </StatusMessage>
        ) : (
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            {activeCharacters.map((c) => renderCharacterItem(c, true))}
          </Stack>
        )}
      </Stack>

      {/* ── 2. Off-Screen (Inactive) Section ── */}
      <Accordion
        variant="ghost"
        size="sm"
        icon="UserCheck"
        title="Off-Screen (Inactive)"
        badge={
          <Badge variant="neutral" size="xs" pill>
            {inactiveCharacters.length}
          </Badge>
        }
        open={!offScreenCollapsed}
        onOpenChange={(nextOpen) => setOffScreenCollapsed(!nextOpen)}
      >
        {inactiveCharacters.length === 0 ? (
          <StatusMessage variant="inline" tone="neutral" icon="UserCheck">
            {charSearch.trim()
              ? `No off-screen characters match "${charSearch}".`
              : "No off-screen characters."}
          </StatusMessage>
        ) : (
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            {inactiveCharacters.map((c) => renderCharacterItem(c, false))}
          </Stack>
        )}
      </Accordion>

      {editingChar && editingChar.templateId ? (
        <DetailedCharacterEditor
          character={editingChar}
          playthrough={playthrough}
          inLibrary={library.some((t) => t.id === editingChar.templateId)}
          originalSheet={
            library.find((t) => t.id === editingChar.templateId)?.content ??
            null
          }
          initialMode="view"
          inScene={activeCharIds.has(editingChar.id)}
          imagePromptPreview={imagePromptPreview}
          onPlaythroughChange={onPlaythroughChange}
          onSave={(payload) => handleEditSave(payload)}
          onSaveToLibrary={(mode, overwritePortrait) =>
            handleEditorSaveToLibrary(mode, overwritePortrait)
          }
          onClose={() => setEditingChar(null)}
        />
      ) : editingChar ? (
        <SimpleCharacterEditor
          character={editingChar}
          inScene={activeCharIds.has(editingChar.id)}
          onSave={(payload) => handleEditSave(payload)}
          onFleshOut={() => void handleFleshOut(editingChar.id)}
          onClose={() => setEditingChar(null)}
        />
      ) : null}

      {portraitModalChar ? (
        <CharacterPortraitModal
          character={portraitModalChar}
          localTemplate={playthrough.characterTemplates.find(
            (t) => t.id === portraitModalChar.templateId,
          )}
          playthrough={playthrough}
          imagePromptPreview={imagePromptPreview}
          onPlaythroughChange={onPlaythroughChange}
          onClose={() => setPortraitModalChar(null)}
        />
      ) : null}

      {confirmUpdateLibChar ? (
        <ConfirmModal
          title={`Update "${confirmUpdateLibChar.name}" in Library?`}
          message="This will overwrite the existing Character Library card's sheet and starting clothing with this playthrough's current state."
          confirmLabel={
            savingId === confirmUpdateLibChar.id
              ? "Updating…"
              : "Update Library"
          }
          isLoading={savingId === confirmUpdateLibChar.id}
          onCancel={() => {
            setConfirmUpdateLibChar(null);
            setOverwriteLibPortrait(false);
          }}
          onConfirm={async () => {
            const targetId = confirmUpdateLibChar.id;
            const overwrite = overwriteLibPortrait;
            setConfirmUpdateLibChar(null);
            setOverwriteLibPortrait(false);
            await handleSave(targetId, "update", overwrite);
          }}
        >
          <CheckboxRow
            checked={overwriteLibPortrait}
            onChange={(e) => setOverwriteLibPortrait(e.target.checked)}
            title="Also overwrite library portrait"
            description="Replace the global Character Library card's portrait with this playthrough's current portrait."
          />
        </ConfirmModal>
      ) : null}

      {generateModalOpen ? (
        <ConfirmModal
          title="Generate New Character"
          confirmLabel={
            isGeneratingChar ? "Generating..." : "Generate Character"
          }
          cancelLabel="Cancel"
          isLoading={isGeneratingChar}
          confirmDisabled={isGeneratingChar}
          onConfirm={handleGenerateCharacter}
          onCancel={handleCancelGenerate}
          maxWidth={500}
        >
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            <Text as="p" size="xs" tone="secondary" leading="relaxed">
              Instruct the Character Manager to generate a new character
              grounded in the story so far. You can provide a specific concept
              or leave it empty to invent an appropriate character.
            </Text>

            {generateCharError ? (
              <StatusMessage variant="banner" tone="err">
                {generateCharError}
              </StatusMessage>
            ) : null}

            <TextArea
              id="char-gen-prompt-input"
              label="Concept or Prompt (Optional)"
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="e.g. A suspicious dockmaster named Orson who recognizes the player, or leave empty to invent someone contextually relevant..."
              rows={3}
              disabled={isGeneratingChar}
            />

            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Text variant="label" size="xs" weight="semibold">
                Character Tier
              </Text>
              <FormGrid cols={2} gap="sm">
                <Card
                  as="button"
                  type="button"
                  variant="panel"
                  padding="sm"
                  layout="column"
                  active={genTier === "detailed"}
                  hoverable
                  disabled={isGeneratingChar}
                  onClick={() => setGenTier("detailed")}
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="FileText" size={14} />
                    <Text size="xs" weight="semibold">
                      Detailed Character
                    </Text>
                  </Stack>
                  <Text size="xs" tone="muted" leading="snug">
                    Full sheet with personality, background &amp; clothing
                  </Text>
                </Card>

                <Card
                  as="button"
                  type="button"
                  variant="panel"
                  padding="sm"
                  layout="column"
                  active={genTier === "simple"}
                  hoverable
                  disabled={isGeneratingChar}
                  onClick={() => setGenTier("simple")}
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="User" size={14} />
                    <Text size="xs" weight="semibold">
                      Simple NPC
                    </Text>
                  </Stack>
                  <Text size="xs" tone="muted" leading="snug">
                    Compact note card (can be fleshed out later)
                  </Text>
                </Card>
              </FormGrid>
            </Stack>

            <Checkbox
              checked={genInScene}
              onChange={(e) => setGenInScene(e.target.checked)}
              disabled={isGeneratingChar}
              label="Place in scene immediately (In Scene / Active)"
            />

            <StatusMessage variant="inline" tone="neutral" icon="Info">
              Using story context:{" "}
              <strong>
                {contextScope === "chapter"
                  ? "Current Chapter (All)"
                  : contextScope === "timeline"
                    ? "Timeline Highlights"
                    : `Recent ${recentCount} messages`}
              </strong>
            </StatusMessage>
          </Stack>
        </ConfirmModal>
      ) : null}
    </Stack>
  );
}

function renderPresenceControl(
  characterName: string,
  present: boolean,
  onTogglePresence?: () => void,
) {
  const badge = (
    <Badge
      variant={present ? "success" : "neutral"}
      size="xs"
      pill
      style={onTogglePresence ? { cursor: "pointer" } : undefined}
      onClick={
        onTogglePresence
          ? (e) => {
              e.stopPropagation();
              onTogglePresence();
            }
          : undefined
      }
      title={
        onTogglePresence
          ? present
            ? "In Scene (Active). Click to move Off-Screen"
            : "Off-Screen (Inactive). Click to bring In Scene"
          : undefined
      }
      aria-label={
        onTogglePresence
          ? present
            ? `Move ${characterName} off-screen`
            : `Bring ${characterName} into scene`
          : undefined
      }
      role={onTogglePresence ? "button" : undefined}
      tabIndex={onTogglePresence ? 0 : undefined}
      onKeyDown={
        onTogglePresence
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onTogglePresence();
              }
            }
          : undefined
      }
    >
      {present ? "● In Scene" : "○ Off-Screen"}
    </Badge>
  );

  return badge;
}

export function SimpleCharacterCard(props: {
  character: CharacterInstance;
  present: boolean;
  isFleshingOut: boolean;
  onFleshOut: () => void;
  onCancel: () => void;
  viewMode?: CastViewMode;
  onEdit?: () => void;
  onTogglePresence?: () => void;
  onRemoveCondition?: (index: number) => void;
  onRemoveFlag?: (index: number) => void;
}) {
  const {
    character,
    present,
    isFleshingOut,
    onFleshOut,
    onCancel,
    viewMode = "portrait",
    onEdit,
    onTogglePresence,
    onRemoveCondition,
    onRemoveFlag,
  } = props;

  return (
    <Card
      as="article"
      variant="elevated"
      padding="md"
      layout="column"
      aiPulse={isFleshingOut}
      fullWidth
    >
      <Stack direction="row" align="start" gap="sm" fullWidth>
        <AvatarBadge
          name={character.name}
          size={viewMode === "portrait" ? "lg" : "md"}
        />
        <Stack direction="column" align="stretch" gap="2xs" flex1 fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            wrap
            fullWidth
          >
            <Text as="h4" variant="title" size="sm" weight="semibold">
              {character.name}
            </Text>
            {renderPresenceControl(character.name, present, onTogglePresence)}
          </Stack>

          <Stack direction="row" align="center" gap="xs" wrap>
            {character.storyRole ? (
              <Badge
                variant="accent"
                size="xs"
                title={`Story Role: ${character.storyRole}`}
              >
                {character.storyRole}
              </Badge>
            ) : null}
            <Badge
              variant="neutral"
              size="xs"
              title="Basic story character. Click 'Flesh Out' to generate full lore & sheet."
              leftIcon="Sparkles"
            >
              Simple NPC
            </Badge>
          </Stack>
        </Stack>
      </Stack>

      {character.description ? (
        <Text as="p" size="xs" tone="secondary" leading="snug">
          {character.description}
        </Text>
      ) : character.memorySummary ? (
        <Text as="p" size="xs" tone="secondary" leading="snug">
          {character.memorySummary}
        </Text>
      ) : null}

      {/* Glanceable Metrics (Mood & Toward Player) */}
      {character.mood || character.towardPlayer ? (
        <Stack direction="row" align="center" gap="xs" wrap fullWidth>
          {character.mood ? (
            <Badge
              variant="outline"
              size="sm"
              leftIcon="Smile"
              title={`Mood: ${character.mood}`}
            >
              <Text as="span" size="xs" tone="muted" weight="medium">
                Mood:
              </Text>
              <Text as="span" size="xs" weight="medium">
                {character.mood}
              </Text>
            </Badge>
          ) : null}

          {character.towardPlayer ? (
            <Badge
              variant="outline"
              size="sm"
              leftIcon="Heart"
              title={`Toward Player: ${character.towardPlayer}`}
            >
              <Text as="span" size="xs" tone="muted" weight="medium">
                Toward:
              </Text>
              <Text as="span" size="xs" weight="medium">
                {character.towardPlayer}
              </Text>
            </Badge>
          ) : null}
        </Stack>
      ) : null}

      {/* Conditions & Flags */}
      {character.conditions.length > 0 || character.flags.length > 0 ? (
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          {character.conditions.length > 0 ? (
            <Stack direction="column" align="stretch" gap="2xs" fullWidth>
              {character.conditions.map((c, i) => (
                <Card key={i} variant="panel" padding="xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" flex1>
                      <Icon name="Zap" size={12} />
                      <Text as="span" size="xs" weight="medium" truncate>
                        {c}
                      </Text>
                    </Stack>
                    {onRemoveCondition ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        iconOnly
                        leftIcon="X"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveCondition(i);
                        }}
                        title="Remove condition"
                        aria-label={`Remove condition ${c}`}
                      />
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          {character.flags.length > 0 ? (
            <Stack direction="column" align="stretch" gap="2xs" fullWidth>
              {character.flags.map((f, i) => (
                <Card key={i} variant="panel" padding="xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" flex1>
                      <Icon name="Bookmark" size={11} />
                      <Text as="span" size="xs" weight="medium" truncate>
                        {f}
                      </Text>
                    </Stack>
                    {onRemoveFlag ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        iconOnly
                        leftIcon="X"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFlag(i);
                        }}
                        title="Remove flag"
                        aria-label={`Remove flag ${f}`}
                      />
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      <Separator spacing="none" />

      {/* Action Row */}
      <Stack
        direction="row"
        align="center"
        justify="between"
        gap="xs"
        wrap
        fullWidth
      >
        {onEdit ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            disabled={isFleshingOut}
            leftIcon="Pencil"
            title="Edit character profile and notes"
          >
            Edit
          </Button>
        ) : (
          <span />
        )}

        {isFleshingOut ? (
          <Stack direction="row" align="center" gap="xs">
            <Button
              size="sm"
              variant="ai"
              isLoading
              disabled
              leftIcon="Sparkles"
            >
              Fleshing Out…
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </Stack>
        ) : (
          <Button
            size="sm"
            variant="ai"
            onClick={onFleshOut}
            leftIcon="Sparkles"
            title="Generate a full character sheet and promote to Detailed Character"
          >
            Flesh Out
          </Button>
        )}
      </Stack>
    </Card>
  );
}

export function CharacterCard(props: {
  character: CharacterInstance;
  playthroughId?: string;
  localTemplate?: CharacterTemplate;
  viewMode?: CastViewMode;
  inLibrary: boolean;
  feedback: SaveFeedback | null;
  saving: boolean;
  onSave: (mode: "update" | "newVersion") => void;
  onEdit: () => void;
  onOpenPortraitModal?: () => void;
  isGeneratingPortrait?: boolean;
  onGeneratePortrait?: () => void;
  onCancelGeneratePortrait?: () => void;
  onTogglePresence?: () => void;
  onOpenLibrary?: (templateId: string) => void;
  content: string;
  present: boolean;
  libraryStale: boolean;
  readOnlySheet: boolean;
  onRemoveCondition?: (index: number) => void;
  onRemoveFlag?: (index: number) => void;
}) {
  const {
    character,
    playthroughId,
    localTemplate,
    viewMode = "portrait",
    content,
    inLibrary,
    feedback,
    saving,
    onSave,
    onEdit,
    onOpenPortraitModal,
    isGeneratingPortrait = false,
    onGeneratePortrait,
    onCancelGeneratePortrait,
    onTogglePresence,
    onOpenLibrary,
    present,
    libraryStale,
    readOnlySheet,
    onRemoveCondition,
    onRemoveFlag,
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(false);

  const templateId = character.templateId ?? "";
  const profileUrl = character.avatarFile
    ? buildImageUrl(character.avatarFile, playthroughId)
    : getCharacterAvatarUrl(
        templateId,
        "profile",
        localTemplate?.avatarUpdatedAt,
      );

  const cardBodyContent = (
    <>
      {/* ── Header Row ── */}
      {viewMode === "compact" ? (
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack direction="row" align="center" gap="sm" fullWidth>
            <AvatarBadge src={profileUrl} name={character.name} size="md" />
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              flex1
              fullWidth
            >
              <Stack direction="row" align="center" gap="xs" wrap>
                <Text as="h4" variant="title" size="sm" weight="semibold">
                  {character.name}
                </Text>
                {character.storyRole ? (
                  <Badge
                    variant="accent"
                    size="xs"
                    title={`Story Role: ${character.storyRole}`}
                  >
                    {character.storyRole}
                  </Badge>
                ) : null}
              </Stack>
              {renderPresenceControl(character.name, present, onTogglePresence)}
            </Stack>
          </Stack>

          <Stack direction="row" align="center" gap="xs" wrap fullWidth>
            {readOnlySheet ? (
              <Badge variant="info" size="xs">
                CCv2
              </Badge>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <Badge
                  variant="warning"
                  size="xs"
                  title="Playthrough changes differ from global library template"
                  leftIcon="AlertTriangle"
                >
                  Diverged
                </Badge>
              ) : (
                <Badge
                  variant="success"
                  size="xs"
                  title="Synced with Character Library"
                  leftIcon="Check"
                >
                  Library Linked
                </Badge>
              )
            ) : (
              <Badge
                variant="neutral"
                size="xs"
                title="Local to this playthrough"
              >
                Local Cast
              </Badge>
            )}

            {inLibrary && onOpenLibrary && templateId ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenLibrary(templateId)}
                title="Open and edit global template in Character Library"
                leftIcon="ExternalLink"
              >
                Library
              </Button>
            ) : null}
          </Stack>
        </Stack>
      ) : (
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            wrap
            fullWidth
          >
            <Stack direction="row" align="center" gap="xs" wrap>
              <Text as="h4" variant="title" size="md" weight="semibold">
                {character.name}
              </Text>
              {character.storyRole ? (
                <Badge
                  variant="accent"
                  size="xs"
                  title={`Story Role: ${character.storyRole}`}
                >
                  {character.storyRole}
                </Badge>
              ) : null}
            </Stack>
            {renderPresenceControl(character.name, present, onTogglePresence)}
          </Stack>

          <Stack direction="row" align="center" gap="xs" wrap fullWidth>
            {readOnlySheet ? (
              <Badge variant="info" size="xs">
                CCv2 Sheet
              </Badge>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <Badge
                  variant="warning"
                  size="xs"
                  title="Playthrough changes differ from global library template"
                  leftIcon="AlertTriangle"
                >
                  Diverged from Library
                </Badge>
              ) : (
                <Badge
                  variant="success"
                  size="xs"
                  title="Synced with Character Library"
                  leftIcon="Check"
                >
                  Library Linked
                </Badge>
              )
            ) : (
              <Badge
                variant="neutral"
                size="xs"
                title="Local to this playthrough"
              >
                Local Cast
              </Badge>
            )}

            {inLibrary && onOpenLibrary && templateId ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenLibrary(templateId)}
                title="Open and edit global template in Character Library"
                leftIcon="ExternalLink"
              >
                Open in Library
              </Button>
            ) : null}
          </Stack>
        </Stack>
      )}

      {/* Glanceable Metrics (Mood & Toward Player) */}
      <Stack direction="row" align="center" gap="xs" wrap fullWidth>
        <Badge
          variant="outline"
          size="sm"
          leftIcon="Smile"
          title={`Mood: ${character.mood || "neutral"}`}
        >
          <Text as="span" size="xs" tone="muted" weight="medium">
            Mood:
          </Text>
          <Text as="span" size="xs" weight="medium">
            {character.mood || "neutral"}
          </Text>
        </Badge>

        <Badge
          variant="outline"
          size="sm"
          leftIcon="Heart"
          title={`Toward Player: ${character.towardPlayer || "neutral"}`}
        >
          <Text as="span" size="xs" tone="muted" weight="medium">
            Toward:
          </Text>
          <Text as="span" size="xs" weight="medium">
            {character.towardPlayer || "neutral"}
          </Text>
        </Badge>
      </Stack>

      {/* Conditions & Flags */}
      {character.conditions.length > 0 || character.flags.length > 0 ? (
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          {character.conditions.length > 0 ? (
            <Stack direction="column" align="stretch" gap="2xs" fullWidth>
              {character.conditions.map((c, i) => (
                <Card key={i} variant="panel" padding="xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" flex1>
                      <Icon name="Zap" size={12} />
                      <Text as="span" size="xs" weight="medium" truncate>
                        {c}
                      </Text>
                    </Stack>
                    {onRemoveCondition ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        iconOnly
                        leftIcon="X"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveCondition(i);
                        }}
                        title="Remove condition"
                        aria-label={`Remove condition ${c}`}
                      />
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          {character.flags.length > 0 ? (
            <Stack direction="column" align="stretch" gap="2xs" fullWidth>
              {character.flags.map((f, i) => (
                <Card key={i} variant="panel" padding="xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" flex1>
                      <Icon name="Bookmark" size={11} />
                      <Text as="span" size="xs" weight="medium" truncate>
                        {f}
                      </Text>
                    </Stack>
                    {onRemoveFlag ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        iconOnly
                        leftIcon="X"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFlag(i);
                        }}
                        title="Remove flag"
                        aria-label={`Remove flag ${f}`}
                      />
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      {/* Collapsible Details Drawer (Body, Appearance, Clothing) */}
      <Accordion
        variant="panel"
        size="sm"
        icon="Shirt"
        title="Physical & Clothing Details"
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        badge={
          character.clothing.length > 0 ? (
            <Badge variant="neutral" size="xs" pill>
              {character.clothing.length}
            </Badge>
          ) : undefined
        }
      >
        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          {content ? (
            <CharacterSheetSections
              content={content}
              headers={["Body", "Appearance"]}
              variant="badges"
            />
          ) : null}

          {character.clothing.length > 0 ? (
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack direction="row" align="center" gap="2xs">
                <Icon name="Shirt" size={12} />
                <Text
                  as="h4"
                  variant="label"
                  size="xs"
                  weight="semibold"
                  tone="secondary"
                  uppercase
                >
                  Equipped Clothing
                </Text>
              </Stack>
              <Stack direction="row" align="center" gap="xs" wrap fullWidth>
                {character.clothing.map((c, i) => (
                  <Badge key={i} variant="outline" size="sm">
                    <Text as="span" size="xs" tone="muted" weight="medium">
                      {c.slot}:
                    </Text>
                    <Text as="span" size="xs" weight="medium">
                      {c.name}
                    </Text>
                    {c.state ? (
                      <Text as="span" size="xs" tone="secondary" italic>
                        ({c.state})
                      </Text>
                    ) : null}
                  </Badge>
                ))}
              </Stack>
            </Stack>
          ) : (
            <Text as="p" size="xs" tone="muted" italic>
              No specific clothing registered.
            </Text>
          )}
        </Stack>
      </Accordion>

      <Separator spacing="none" />

      {/* Footer Action Row */}
      <Stack
        direction="row"
        align="center"
        justify="between"
        gap="xs"
        wrap
        fullWidth
      >
        <Stack direction="row" align="center" gap="xs" wrap>
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            leftIcon="FileText"
          >
            Full Sheet
          </Button>
          {onOpenPortraitModal ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenPortraitModal}
              leftIcon="IdCard"
              title="Generate or manage playthrough portraits for this character"
            >
              Portrait
              {(character.avatars?.length ?? 0) > 0
                ? ` (${character.avatars!.length})`
                : ""}
            </Button>
          ) : null}
        </Stack>

        <Stack direction="row" align="center" gap="xs" wrap>
          {isGeneratingPortrait ? (
            <>
              <Button
                size="sm"
                variant="ai"
                isLoading
                disabled
                leftIcon="Sparkles"
              >
                Generating…
              </Button>
              {onCancelGeneratePortrait ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelGeneratePortrait}
                  title="Cancel portrait generation"
                >
                  Cancel
                </Button>
              ) : null}
            </>
          ) : onGeneratePortrait ? (
            <Button
              size="sm"
              variant="ai"
              onClick={onGeneratePortrait}
              leftIcon="Sparkles"
              title="Generate a portrait in the background from this character's current sheet and clothing"
            >
              Generate Image
            </Button>
          ) : null}
          {inLibrary ? (
            <>
              <Button
                size="sm"
                variant="primary"
                isLoading={saving}
                disabled={saving}
                onClick={() => onSave("update")}
                title="Update the existing Character Library template"
              >
                Update Library
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isLoading={saving}
                disabled={saving}
                onClick={() => onSave("newVersion")}
                title="Save as a new version in the Character Library"
              >
                New Version
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              isLoading={saving}
              disabled={saving}
              onClick={() => onSave("update")}
              title="Save this character to the Character Library"
            >
              Save to Library
            </Button>
          )}
        </Stack>

        {feedback ? (
          <Badge variant={feedback.ok ? "success" : "danger"} size="xs">
            {feedback.text}
          </Badge>
        ) : null}
      </Stack>
    </>
  );

  if (viewMode === "portrait") {
    return (
      <Card
        as="article"
        variant="elevated"
        padding="none"
        layout="column"
        fullWidth
      >
        <Card.Cover position="top" aspect="portrait">
          <CharacterAvatar
            template={
              localTemplate ?? {
                id: templateId,
                name: character.name,
              }
            }
            avatarFile={character.avatarFile}
            playthroughId={playthroughId}
            variant="portrait"
          />
        </Card.Cover>
        <Card.Body padding="md" gap="sm">
          {cardBodyContent}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card
      as="article"
      variant="elevated"
      padding="md"
      layout="column"
      fullWidth
    >
      {cardBodyContent}
    </Card>
  );
}
