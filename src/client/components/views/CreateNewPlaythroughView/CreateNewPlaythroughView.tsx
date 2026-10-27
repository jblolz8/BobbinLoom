import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  CharacterTemplate,
  LorebookSummary,
  ViewPreferences,
} from "../../../../schemas";
import type { Persona, ResolvedSetupPreferences } from "../../../api";
import {
  SETUP_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  getTagTaxonomy,
  resolveSetupPreferences,
  updateViewPreferences,
} from "../../../api";
import {
  listProviderConnections,
  setCharacterTextProvider,
  setGenerationTextProvider,
  type ProviderConnection,
} from "../../../api/providers";
import { Badge, Button, Header, Modal, Stack, Tabs } from "../../base";
import { usePagination } from "../../../hooks/usePagination";
import type { ViewMode } from "../../library/CharacterLibrary";
import {
  filterLibraryEntries,
  groupByLineage,
  type CharacterSortOption,
  type SortDirection,
} from "../../../../engine/characterCards";
import type { TagTaxonomyConfig } from "../../../../engine/tagTaxonomy";
import { PersonaStepPanel } from "./PersonaStepPanel";
import { CastStepPanel } from "./CastStepPanel";
import { SettingStepPanel } from "./SettingStepPanel";
import { GeneratingPlaythroughView } from "./GeneratingPlaythroughView";

export type SetupFormState = {
  name: string;
  setting: string;
  allowAdditionalCharacters: boolean;
  generateOpeningChoices: boolean;
  openingMode: "quick" | "fleshedOut";
  /** The text connection this playthrough is generated with; "" follows whichever
   *  connection is active. Persisted in the provider registry, not here — the modal
   *  reads it back on open. */
  providerId: string;
};

export const defaultSetupForm: SetupFormState = {
  name: "",
  setting: "",
  allowAdditionalCharacters: true,
  generateOpeningChoices: false,
  openingMode: "fleshedOut",
  providerId: "",
};

export type SetupStepTab = "persona" | "cast" | "setting";

export type CreateNewPlaythroughViewProps = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  castLibrary: CharacterTemplate[];
  selectedCastIds: string[];
  onToggleCastId: (id: string) => void;
  setSelectedCastIds?: (ids: string[]) => void;
  lorebookLibrary: LorebookSummary[];
  selectedLorebookIds: string[];
  onToggleLorebookId: (id: string) => void;
  setSelectedLorebookIds?: (ids: string[]) => void;
  cardSettings: Array<{ title: string; scenario: string }>;
  setupForm: SetupFormState;
  onSetupFormChange: (updater: (f: SetupFormState) => SetupFormState) => void;
  generating: boolean;
  genError: string | null;
  genProgressPhase?: string | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onStartBlank: () => void;
  onBack: () => void;
  onOpenPersonaManager: () => void;
  onOpenLorebookManager: () => void;
};

export function CreateNewPlaythroughView(props: CreateNewPlaythroughViewProps) {
  const {
    open,
    onClose,
    personas,
    selectedPersonaId,
    onSelectPersona,
    castLibrary,
    selectedCastIds,
    onToggleCastId,
    setSelectedCastIds,
    lorebookLibrary,
    selectedLorebookIds,
    onToggleLorebookId,
    cardSettings,
    setupForm,
    onSetupFormChange,
    generating,
    genError,
    genProgressPhase,
    onGenerate,
    onCancelGenerate,
    onStartBlank,
    onOpenPersonaManager,
    onOpenLorebookManager,
  } = props;

  const titleId = useId();

  // Which text connection new playthroughs are generated with. The registry holds both the
  // connection list and the remembered choice, so the modal reads it on open: a fresh session
  // must open on the saved choice rather than on the default slot.
  const [textConnections, setTextConnections] = useState<ProviderConnection[]>(
    [],
  );
  const [activeTextProviderId, setActiveTextProviderId] = useState("");
  const [characterProviderId, setCharacterProviderId] = useState("");
  const [providerChoiceError, setProviderChoiceError] = useState<string | null>(
    null,
  );
  // Held in a ref so the registry read depends on `open` ALONE: the parent passes a fresh
  // callback every render, and re-running the effect would refetch on every keystroke.
  const onSetupFormChangeRef = useRef(onSetupFormChange);
  onSetupFormChangeRef.current = onSetupFormChange;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listProviderConnections()
      .then((registry) => {
        if (cancelled) return;
        setTextConnections(
          registry.connections.filter((c) => c.kind === "text"),
        );
        setActiveTextProviderId(registry.activeTextProviderId);
        setCharacterProviderId(registry.characterTextProviderId ?? "");
        const stored = registry.generationTextProviderId ?? "";
        if (stored)
          onSetupFormChangeRef.current((f) =>
            f.providerId === "" ? { ...f, providerId: stored } : f,
          );
      })
      .catch(() => {
        /* the list degrades to the default slot; generation still falls back server-side */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const textProviderOptions = useMemo(() => {
    const options = [
      { value: "", label: "Current active text provider" },
      ...textConnections.map((c) => ({
        value: c.id,
        label: `${c.label}${c.model ? ` — ${c.model}` : ""}${c.id === activeTextProviderId ? " (active)" : ""}`,
      })),
    ];
    if (
      setupForm.providerId &&
      !textConnections.some((c) => c.id === setupForm.providerId)
    ) {
      options.push({
        value: setupForm.providerId,
        label: `${setupForm.providerId} (not found)`,
      });
    }
    return options;
  }, [textConnections, activeTextProviderId, setupForm.providerId]);

  const textProviderLabel = useMemo(() => {
    if (!setupForm.providerId) return "Active connection";
    return (
      textConnections.find((c) => c.id === setupForm.providerId)?.label ??
      `${setupForm.providerId} (not found)`
    );
  }, [setupForm.providerId, textConnections]);

  const characterProviderOptions = useMemo(() => {
    const options = [
      { value: "", label: "Current active text provider" },
      ...textConnections.map((c) => ({
        value: c.id,
        label: `${c.label}${c.model ? ` - ${c.model}` : ""}${c.id === activeTextProviderId ? " (active)" : ""}`,
      })),
    ];
    if (
      characterProviderId &&
      !textConnections.some((c) => c.id === characterProviderId)
    ) {
      options.push({
        value: characterProviderId,
        label: `${characterProviderId} (not found)`,
      });
    }
    return options;
  }, [textConnections, activeTextProviderId, characterProviderId]);

  const handleCharacterProviderChange = (id: string) => {
    setCharacterProviderId(id);
    setProviderChoiceError(null);
    setCharacterTextProvider(id === "" ? null : id).catch(() =>
      setProviderChoiceError(
        "Could not remember that choice - it will still be used for this generation.",
      ),
    );
  };

  const handleProviderChange = (id: string) => {
    onSetupFormChange((f) => ({ ...f, providerId: id }));
    setProviderChoiceError(null);
    setGenerationTextProvider(id === "" ? null : id).catch(() =>
      setProviderChoiceError(
        "Could not remember that choice — it will still be used for this generation.",
      ),
    );
  };

  const [activeTab, setActiveTab] = useState<SetupStepTab>("persona");
  const [castSearch, setCastSearchState] = useState(
    SETUP_PREFERENCE_DEFAULTS.castSearch,
  );
  const [sortBy, setSortByState] = useState<CharacterSortOption>(
    SETUP_PREFERENCE_DEFAULTS.castSortBy,
  );
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(
    SETUP_PREFERENCE_DEFAULTS.castSortDir,
  );
  const [sidebarViewMode, setSidebarViewMode] = useState<"grouped" | "flat">(
    "grouped",
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const setupTouchedRef = useRef(false);

  const writeSetupPreference = (patch: ViewPreferences["setup"]) => {
    setupTouchedRef.current = true;
    void updateViewPreferences({ setup: patch }).catch(() => {
      /* The next read reconciles; a failed write must not break the control. */
    });
  };

  const setCastSearch = (val: string) => {
    setCastSearchState(val);
    writeSetupPreference({ castSearch: val });
  };

  const setSortBy = (option: CharacterSortOption) => {
    const nextDir: SortDirection =
      option === "createdAt" || option === "updatedAt" ? "desc" : "asc";
    setSortByState(option);
    setSortDirectionState(nextDir);
    writeSetupPreference({ castSortBy: option, castSortDir: nextDir });
  };

  const toggleSortDirection = () => {
    const nextDir: SortDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirectionState(nextDir);
    writeSetupPreference({ castSortDir: nextDir });
  };

  const [taxonomyConfig, setTaxonomyConfig] =
    useState<TagTaxonomyConfig | null>(null);

  const [viewMode, setViewModeState] = useState<ViewMode>(
    SETUP_PREFERENCE_DEFAULTS.castViewMode,
  );

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    writeSetupPreference({ castViewMode: mode });
  };

  const [showLorebooks, setShowLorebooksState] = useState<boolean>(
    SETUP_PREFERENCE_DEFAULTS.showLorebooks,
  );

  const setShowLorebooks = (nextOpen: boolean) => {
    setShowLorebooksState(nextOpen);
    writeSetupPreference({ showLorebooks: nextOpen });
  };

  const applySetupPreferences = (prefs: ResolvedSetupPreferences) => {
    setCastSearchState(prefs.castSearch);
    setSortByState(prefs.castSortBy);
    setSortDirectionState(prefs.castSortDir);
    setViewModeState(prefs.castViewMode);
    setShowLorebooksState(prefs.showLorebooks);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled || setupTouchedRef.current) return;
      applySetupPreferences(resolveSetupPreferences(preferences));
    })().catch(() => {
      /* A failed read leaves the defaults; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open) {
      void getTagTaxonomy()
        .then((res) => setTaxonomyConfig(res.tagTaxonomy))
        .catch(() => setTaxonomyConfig(null));
    }
  }, [open]);

  const returningFromSubModalRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (returningFromSubModalRef.current) {
        returningFromSubModalRef.current = false;
      } else {
        setActiveTab("persona");
      }
    }
  }, [open]);

  const allTagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of castLibrary) {
      for (const tag of t.tags ?? []) {
        const norm = tag.trim().toLowerCase();
        if (norm) {
          map.set(norm, (map.get(norm) ?? 0) + 1);
        }
      }
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [castLibrary]);

  const activeFilterTags = useMemo(() => {
    return castSearch
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.startsWith("tag:") && t.length > 4)
      .map((t) => t.slice(4));
  }, [castSearch]);

  function toggleTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = castSearch.split(/\s+/).filter(Boolean);
    const existingIdx = tokens.findIndex((t) => {
      const low = t.toLowerCase();
      return low === tagToken || low === `tag:${tag.toLowerCase()}`;
    });
    let next: string[];
    if (existingIdx >= 0) {
      next = tokens.filter((_, i) => i !== existingIdx);
    } else {
      next = [...tokens, tagToken];
    }
    setCastSearch(next.join(" "));
  }

  function removeFilterTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = castSearch.split(/\s+/).filter(Boolean);
    const next = tokens.filter((t) => {
      const low = t.toLowerCase();
      return low !== tagToken && low !== `tag:${tag.toLowerCase()}`;
    });
    setCastSearch(next.join(" "));
  }

  function toggleCategoryCollapse(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const filteredCast = useMemo(() => {
    return filterLibraryEntries(castLibrary, castSearch);
  }, [castLibrary, castSearch]);

  const castGroups = useMemo(() => {
    return groupByLineage(filteredCast, sortBy, sortDirection);
  }, [filteredCast, sortBy, sortDirection]);

  const castPager = usePagination({
    items: castGroups,
    persistAs: "setupCast",
    resetDeps: [open, castSearch, sortBy, sortDirection],
  });

  const selectedPersona = useMemo(() => {
    return personas.find((p) => p.id === selectedPersonaId);
  }, [personas, selectedPersonaId]);

  const selectedCastTemplates = useMemo(() => {
    return castLibrary.filter((t) => selectedCastIds.includes(t.id));
  }, [castLibrary, selectedCastIds]);

  const selectedCastCount = selectedCastIds.length;
  const selectedLorebookCount = selectedLorebookIds.length;

  function handleSelectAllFilteredCast() {
    const selectable = filteredCast
      .filter((t) => t.format !== "ccv2")
      .map((t) => t.id);
    if (setSelectedCastIds) {
      const next = Array.from(new Set([...selectedCastIds, ...selectable]));
      setSelectedCastIds(next);
    } else {
      selectable.forEach((id) => {
        if (!selectedCastIds.includes(id)) onToggleCastId(id);
      });
    }
  }

  function handleClearCast() {
    if (setSelectedCastIds) {
      setSelectedCastIds([]);
    } else {
      selectedCastIds.forEach((id) => onToggleCastId(id));
    }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissDisabled={generating}
      size="wide"
      fullScreenMobile
      ariaLabelledBy={titleId}
    >
      <Header
        variant="modal"
        title="Create New Playthrough"
        titleId={titleId}
        bordered
        actions={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            leftIcon="X"
            tooltip="Close"
            tooltipSide="bottom"
            onClick={onClose}
            disabled={generating}
            aria-label="Close setup"
          />
        }
      />

      {generating ? (
        <Modal.Body>
          <Modal.Content>
            <GeneratingPlaythroughView
              openingMode={setupForm.openingMode}
              genProgressPhase={genProgressPhase}
              personaName={selectedPersona?.name || "None"}
              selectedCastCount={selectedCastCount}
              selectedLorebookCount={selectedLorebookCount}
              textProviderLabel={textProviderLabel}
              onCancelGenerate={onCancelGenerate}
            />
          </Modal.Content>
        </Modal.Body>
      ) : (
        <>
          <Tabs<SetupStepTab>
            variant="segmented"
            size="sm"
            fullWidth
            activeTab={activeTab}
            onChange={setActiveTab}
            ariaLabel="Setup Steps"
            tabs={[
              {
                id: "persona",
                icon: "User",
                label: "1. Persona",
                badge: selectedPersona ? (
                  <Badge
                    variant="accent"
                    size="xs"
                    pill
                    truncate
                    maxWidth={120}
                  >
                    {selectedPersona.name}
                  </Badge>
                ) : undefined,
              },
              {
                id: "cast",
                icon: "Users",
                label: "2. Cast",
                badge: (
                  <Badge
                    variant={selectedCastCount > 0 ? "accent" : "neutral"}
                    size="xs"
                    pill
                  >
                    {selectedCastCount} Selected
                  </Badge>
                ),
              },
              {
                id: "setting",
                icon: "BookOpen",
                label: "3. Setting & Story",
                badge:
                  selectedLorebookCount > 0 ? (
                    <Badge variant="accent" size="xs" pill>
                      {selectedLorebookCount} Lorebooks
                    </Badge>
                  ) : undefined,
              },
            ]}
          />

          <Modal.Body>
            <Modal.Content className="is-modal">
              <Tabs.Panel active={activeTab === "persona"}>
                {activeTab === "persona" ? (
                  <PersonaStepPanel
                    personas={personas}
                    selectedPersonaId={selectedPersonaId}
                    onSelectPersona={onSelectPersona}
                    onOpenPersonaManager={
                      onOpenPersonaManager
                        ? () => {
                            returningFromSubModalRef.current = true;
                            onOpenPersonaManager();
                          }
                        : undefined
                    }
                  />
                ) : null}
              </Tabs.Panel>

              <Tabs.Panel active={activeTab === "cast"}>
                {activeTab === "cast" ? (
                  <CastStepPanel
                    castLibraryCount={castLibrary.length}
                    filteredCastCount={filteredCast.length}
                    paginatedCastGroups={castPager.pageItems}
                    selectedCastIds={selectedCastIds}
                    selectedCastTemplates={selectedCastTemplates}
                    onToggleCastId={onToggleCastId}
                    onSelectAllFilteredCast={handleSelectAllFilteredCast}
                    onClearCast={handleClearCast}
                    castSearch={castSearch}
                    onChangeCastSearch={setCastSearch}
                    sortBy={sortBy}
                    onChangeSortBy={setSortBy}
                    sortDirection={sortDirection}
                    onToggleSortDirection={toggleSortDirection}
                    viewMode={viewMode}
                    onChangeViewMode={setViewMode}
                    taxonomyConfig={taxonomyConfig}
                    allTagCounts={allTagCounts}
                    activeFilterTags={activeFilterTags}
                    onToggleTag={toggleTag}
                    onRemoveFilterTag={removeFilterTag}
                    sidebarViewMode={sidebarViewMode}
                    onChangeSidebarViewMode={setSidebarViewMode}
                    collapsedCategories={collapsedCategories}
                    onToggleCategoryCollapse={toggleCategoryCollapse}
                    page={castPager.page}
                    pageSize={castPager.pageSize}
                    totalItems={castPager.totalItems}
                    totalPages={castPager.totalPages}
                    onPageChange={castPager.setPage}
                    onPageSizeChange={castPager.setPageSize}
                    onCommitCustomPageSize={castPager.commitCustomPageSize}
                  />
                ) : null}
              </Tabs.Panel>

              <Tabs.Panel active={activeTab === "setting"}>
                {activeTab === "setting" ? (
                  <SettingStepPanel
                    lorebookLibrary={lorebookLibrary}
                    selectedLorebookIds={selectedLorebookIds}
                    onToggleLorebookId={onToggleLorebookId}
                    onOpenLorebookManager={
                      onOpenLorebookManager
                        ? () => {
                            returningFromSubModalRef.current = true;
                            onOpenLorebookManager();
                          }
                        : undefined
                    }
                    showLorebooks={showLorebooks}
                    onChangeShowLorebooks={setShowLorebooks}
                    cardSettings={cardSettings}
                    setupForm={setupForm}
                    onSetupFormChange={onSetupFormChange}
                    textProviderOptions={textProviderOptions}
                    onProviderChange={handleProviderChange}
                    characterProviderId={characterProviderId}
                    characterProviderOptions={characterProviderOptions}
                    onCharacterProviderChange={handleCharacterProviderChange}
                    providerChoiceError={providerChoiceError}
                    genError={genError}
                    onGenerate={onGenerate}
                    onStartBlank={onStartBlank}
                  />
                ) : null}
              </Tabs.Panel>
            </Modal.Content>
          </Modal.Body>

          <Modal.Footer>
            {activeTab === "persona" ? (
              <Stack
                direction="row"
                align="center"
                justify="end"
                gap="sm"
                fullWidth
              >
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon="ArrowRight"
                  onClick={() => setActiveTab("cast")}
                >
                  Next: Choose Cast
                </Button>
              </Stack>
            ) : null}

            {activeTab === "cast" ? (
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                wrap
                fullWidth
              >
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon="ArrowLeft"
                  onClick={() => setActiveTab("persona")}
                >
                  Back: Persona
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon="ArrowRight"
                  onClick={() => setActiveTab("setting")}
                >
                  Next: Setting &amp; Story
                </Button>
              </Stack>
            ) : null}

            {activeTab === "setting" ? (
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                wrap
                fullWidth
              >
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon="ArrowLeft"
                  onClick={() => setActiveTab("cast")}
                >
                  Back: Cast
                </Button>

                <Stack direction="row" align="center" gap="sm" wrap>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="FilePlus"
                    onClick={onStartBlank}
                    disabled={generating}
                    title="Start immediately with selected cast without generating scenario text"
                  >
                    Start Blank
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon="Wand2"
                    onClick={onGenerate}
                    isLoading={generating}
                  >
                    Generate Scenario
                  </Button>
                </Stack>
              </Stack>
            ) : null}
          </Modal.Footer>
        </>
      )}
    </Modal>
  );
}
