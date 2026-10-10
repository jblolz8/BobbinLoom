import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterInstance, CharacterTemplate, Playthrough } from "../../../../../schemas";
import {
  editCharacter,
  getCharacterAvatarUrl,
  listCharacters,
  fleshOutCharacter,
  saveCharacterToLibrary,
} from "../../../../api";
import {
  listProviderConnections,
  setCharacterTextProvider,
  type ProviderConnection
} from "../../../../api/providers";
import type { CharacterEditPayload } from "../../../../api";
import {
  CAST_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveCastPreferences,
  updateViewPreferences,
} from "../../../../api";
import { CharacterEditor } from "../../../modals/CharacterEditor";
import { CharacterSheetSections } from "./CharacterSheetSections";
import { AvatarBadge, Badge, Button, Icon, SearchBar, SimpleSelect } from "../../../base";
import type { SimpleSelectOption } from "../../../base/Select";
import { ModelIcon } from "../../../base/ModelIcon";

type SaveFeedback = { ok: boolean; text: string };

export type CharsTabProps = {
  playthrough: Playthrough;
  onPlaythroughChange: (p: Playthrough) => void;
  onOpenLibrary?: (templateId: string) => void;
};

export type CastViewMode = "portrait" | "compact";

export function CharsTab({ playthrough, onPlaythroughChange, onOpenLibrary }: CharsTabProps) {
  const [library, setLibrary] = useState<CharacterTemplate[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<Record<string, SaveFeedback>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingChar, setEditingChar] = useState<CharacterInstance | null>(null);
  const [fleshingOutId, setFleshingOutId] = useState<string | null>(null);
  const fleshOutAbortRef = useRef<AbortController | null>(null);
  const [fleshOutError, setFleshOutError] = useState<string | null>(null);
  const [textConnections, setTextConnections] = useState<ProviderConnection[]>([]);
  const [activeTextProviderId, setActiveTextProviderId] = useState("");
  const [characterProviderId, setCharacterProviderId] = useState("");
  const [charSearch, setCharSearch] = useState("");
  const [offScreenCollapsed, setOffScreenCollapsed] = useState(false);
  const [castViewMode, setCastViewModeState] = useState<CastViewMode>(
    CAST_PREFERENCE_DEFAULTS.viewMode
  );

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled || castTouchedRef.current) return;
      setCastViewModeState(resolveCastPreferences(preferences).viewMode);
    })().catch(() => {
      /* A failed read leaves the default; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listCharacters().then(setLibrary).catch(() => { /* library membership is cosmetic */ });
  }, []);

  async function handleSave(characterId: string, mode: "update" | "newVersion") {
    setSavingId(characterId);
    try {
      const result = await saveCharacterToLibrary(playthrough.id, characterId, mode);
      setLibrary(await listCharacters());
      const text = mode === "newVersion"
        ? `✓ Saved as v${result.template.version}`
        : result.created ? "✓ Saved to library" : "✓ Library updated";
      setSaveFeedback((f) => ({ ...f, [characterId]: { ok: true, text } }));
      setTimeout(() => {
        setSaveFeedback((f) => {
          const next = { ...f };
          delete next[characterId];
          return next;
        });
      }, 4000);
    } catch (e) {
      setSaveFeedback((f) => ({ ...f, [characterId]: { ok: false, text: e instanceof Error ? e.message : String(e) } }));
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
    const activeConn = textConnections.find((c) => c.id === activeTextProviderId);
    const activeDesc = activeConn
      ? `${activeConn.label}${activeConn.model ? ` (${activeConn.model})` : ""}`
      : "Follows active story connection";

    const defaultOpt: SimpleSelectOption<string> = {
      value: "",
      label: "Current active text provider",
      description: activeDesc,
      icon: activeConn?.model ? <ModelIcon model={activeConn.model} size={14} /> : <Icon name="Cpu" size={14} />
    };

    const rows: SimpleSelectOption<string>[] = textConnections.map((c) => ({
      value: c.id,
      label: `${c.label}${c.id === activeTextProviderId ? " (active)" : ""}`,
      description: c.model || undefined,
      icon: <ModelIcon model={c.model} size={14} />
    }));

    if (characterProviderId && !textConnections.some((c) => c.id === characterProviderId)) {
      rows.push({
        value: characterProviderId,
        label: `${characterProviderId} (not found)`,
        icon: <Icon name="AlertTriangle" size={14} />
      });
    }

    return [defaultOpt, ...rows];
  }, [textConnections, activeTextProviderId, characterProviderId]);

  async function handleFleshOut(characterId: string) {
    fleshOutAbortRef.current?.abort();
    const controller = new AbortController();
    fleshOutAbortRef.current = controller;
    setFleshingOutId(characterId);
    setFleshOutError(null);
    try {
      const updated = await fleshOutCharacter(playthrough.id, characterId, undefined, controller.signal);
      if (fleshOutAbortRef.current === controller) {
        onPlaythroughChange(updated);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError") && fleshOutAbortRef.current === controller) {
        setFleshOutError(e instanceof Error ? e.message : "Fleshing out character failed");
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

  async function handleEditSave(payload: CharacterEditPayload) {
    if (!editingChar) return;
    const updated = await editCharacter(playthrough.id, editingChar.id, payload);
    onPlaythroughChange(updated);
  }

  async function handleEditorSaveToLibrary(mode: "update" | "newVersion") {
    if (!editingChar) throw new Error("No character being edited");
    const result = await saveCharacterToLibrary(playthrough.id, editingChar.id, mode);
    setLibrary(await listCharacters());
    return { version: result.template.version, created: result.created };
  }

  const activeCharIds = useMemo(() => new Set(playthrough.activeCharacters ?? []), [playthrough.activeCharacters]);

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
    return playthrough.characters.filter((c) => activeCharIds.has(c.id)).filter(filterFn);
  }, [playthrough.characters, activeCharIds, charSearch]);

  const inactiveCharacters = useMemo(() => {
    return playthrough.characters.filter((c) => !activeCharIds.has(c.id)).filter(filterFn);
  }, [playthrough.characters, activeCharIds, charSearch]);

  async function handleRemoveCharCondition(char: CharacterInstance, index: number) {
    const updatedConditions = char.conditions.filter((_, i) => i !== index);
    const updated = await editCharacter(playthrough.id, char.id, { conditions: updatedConditions });
    onPlaythroughChange(updated);
  }

  async function handleRemoveCharFlag(char: CharacterInstance, index: number) {
    const updatedFlags = char.flags.filter((_, i) => i !== index);
    const updated = await editCharacter(playthrough.id, char.id, { flags: updatedFlags });
    onPlaythroughChange(updated);
  }

  function renderCharacterItem(character: CharacterInstance, inScene: boolean) {
    if (character.templateId) {
      const localTpl = playthrough.characterTemplates.find((t) => t.id === character.templateId);
      const libTpl = library.find((t) => t.id === character.templateId);
      const isCcv2 = localTpl?.format === "ccv2";
      const libraryStale = !!localTpl && !!libTpl
        && JSON.stringify({ content: localTpl.content, summary: localTpl.summary, startingClothing: localTpl.startingClothing })
        !== JSON.stringify({ content: libTpl.content, summary: libTpl.summary, startingClothing: libTpl.startingClothing });
      return (
        <CharacterCard
          key={character.id}
          character={character}
          content={localTpl?.content ?? ""}
          localTemplate={localTpl}
          viewMode={castViewMode}
          inLibrary={library.some((t) => t.id === character.templateId)}
          present={inScene}
          libraryStale={libraryStale}
          readOnlySheet={isCcv2}
          feedback={saveFeedback[character.id] ?? null}
          saving={savingId === character.id}
          onSave={(mode) => { void handleSave(character.id, mode); }}
          onEdit={() => setEditingChar(character)}
          onOpenLibrary={onOpenLibrary}
          onRemoveCondition={(i) => void handleRemoveCharCondition(character, i)}
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
        onRemoveCondition={(i) => void handleRemoveCharCondition(character, i)}
        onRemoveFlag={(i) => void handleRemoveCharFlag(character, i)}
      />
    );
  }

  return (
    <div className="chars-tab-container">
      {/* ── Character Creator Provider Settings ── */}
      <div className="char-provider-toolbar">
        <div className="char-provider-header">
          <div className="char-provider-label-wrap">
            <Icon name="Sparkles" size={13} className="char-provider-sparkle" />
            <span className="char-provider-title">Flesh-Out Provider</span>
          </div>
          <span className="char-provider-hint" title="AI model used when generating detailed character sheets for simple NPCs">
            Used to expand simple characters
          </span>
        </div>
        <div className="char-provider-select-wrap">
          <SimpleSelect
            id="char-provider-select"
            size="xs"
            variant="filled"
            fullWidth
            value={characterProviderId}
            onChange={handleCharacterProviderChange}
            options={characterProviderOptions}
            placeholder="Current active text provider"
            aria-label="Character creator AI provider"
          />
        </div>
      </div>

      {fleshOutError ? (
        <div className="promote-error char-provider-error">
          <Icon name="AlertTriangle" size={14} />
          <span className="error-text">{fleshOutError}</span>
          <button className="dismiss" onClick={() => setFleshOutError(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {/* ── Search & View Mode Toolbar ── */}
      {playthrough.characters.length > 0 && (
        <div className="chars-filter-bar">
          <SearchBar
            value={charSearch}
            onChange={setCharSearch}
            placeholder="Search characters…"
            size="sm"
            containerClassName="chars-search-input"
          />
          <div className="view-mode-switcher cast-view-switcher" role="group" aria-label="Cast View Mode">
            <button
              type="button"
              className={`view-mode-btn ${castViewMode === "portrait" ? "active" : ""}`}
              onClick={() => setCastViewMode("portrait")}
              title="Full Portrait View"
            >
              <Icon name="IdCard" size={13} />
              <span>Portrait</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${castViewMode === "compact" ? "active" : ""}`}
              onClick={() => setCastViewMode("compact")}
              title="Compact Profile View"
            >
              <Icon name="List" size={13} />
              <span>Compact</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 1. In Scene (Active) Section ── */}
      <section className="chars-section">
        <div className="section-header-clean">
          <div className="section-title-wrap">
            <Icon name="Users" size={14} />
            <span className="section-title-text">In Scene (Active)</span>
            <Badge variant="success" size="xs" pill>{activeCharacters.length}</Badge>
          </div>
        </div>

        {activeCharacters.length === 0 ? (
          <p className="info-empty-state">
            {charSearch.trim() ? `No active characters match "${charSearch}".` : "No characters currently in the scene."}
          </p>
        ) : (
          <div className={`chars-cards-list mode-${castViewMode}`}>
            {activeCharacters.map((c) => renderCharacterItem(c, true))}
          </div>
        )}
      </section>

      {/* ── 2. Off-Screen (Inactive) Section ── */}
      <section className="chars-section background-section">
        <div className="section-header-clean">
          <button
            type="button"
            className="section-title-toggle-btn"
            onClick={() => setOffScreenCollapsed(!offScreenCollapsed)}
            aria-expanded={!offScreenCollapsed}
            title={offScreenCollapsed ? "Expand off-screen characters" : "Collapse off-screen characters"}
          >
            <span className="section-title-wrap">
              <Icon name="UserCheck" size={14} />
              <span className="section-title-text">Off-Screen (Inactive)</span>
              <Badge variant="neutral" size="xs" pill>{inactiveCharacters.length}</Badge>
            </span>
            <Icon name={offScreenCollapsed ? "ChevronDown" : "ChevronUp"} size={14} className="toggle-chevron" />
          </button>
        </div>

        {!offScreenCollapsed && (
          inactiveCharacters.length === 0 ? (
            <p className="info-empty-state">
              {charSearch.trim() ? `No off-screen characters match "${charSearch}".` : "No off-screen characters."}
            </p>
          ) : (
            <div className={`chars-cards-list mode-${castViewMode}`}>
              {inactiveCharacters.map((c) => renderCharacterItem(c, false))}
            </div>
          )
        )}
      </section>

      {editingChar ? (
        <CharacterEditor
          character={editingChar}
          playthrough={playthrough}
          inLibrary={editingChar.templateId ? library.some((t) => t.id === editingChar.templateId) : false}
          originalSheet={editingChar.templateId ? library.find((t) => t.id === editingChar.templateId)?.content ?? null : null}
          initialMode="view"
          onSave={(payload) => handleEditSave(payload)}
          onSaveToLibrary={(mode) => handleEditorSaveToLibrary(mode)}
          onClose={() => setEditingChar(null)}
        />
      ) : null}
    </div>
  );
}

export function SimpleCharacterCard(props: {
  character: CharacterInstance;
  present: boolean;
  isFleshingOut: boolean;
  onFleshOut: () => void;
  onCancel: () => void;
  viewMode?: CastViewMode;
  onEdit?: () => void;
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
    onRemoveCondition,
    onRemoveFlag
  } = props;

  return (
    <article className={`card playview-char-card simple-character-card mode-${viewMode}${isFleshingOut ? " is-fleshing-out" : ""}`}>
      {viewMode === "portrait" ? (
        <div className="char-simple-portrait-header">
          <AvatarBadge
            name={character.name}
            size="lg"
            className="char-simple-avatar"
          />
          <div className="char-simple-title-group">
            <div className="char-title-row">
              <h4 className="char-name">{character.name}</h4>
              <Badge
                variant={present ? "success" : "neutral"}
                size="xs"
                pill
              >
                {present ? "● In Scene" : "○ Off-Screen"}
              </Badge>
            </div>
            <div className="char-badges-wrap">
              {character.storyRole ? (
                <Badge variant="accent" size="xs" title={`Story Role: ${character.storyRole}`}>
                  {character.storyRole}
                </Badge>
              ) : null}
              <Badge
                variant="neutral"
                size="xs"
                title="Basic story character. Click 'Flesh Out' to generate full lore & sheet."
                leftIcon={<Icon name="Sparkles" size={10} />}
              >
                Simple NPC
              </Badge>
            </div>
          </div>
        </div>
      ) : (
        <div className="char-compact-header-wrap">
          <div className="char-compact-top-line">
            <AvatarBadge
              name={character.name}
              size="md"
              className="char-compact-avatar"
            />
            <div className="char-compact-name-row">
              <h4 className="char-name">{character.name}</h4>
              {character.storyRole ? (
                <Badge variant="accent" size="xs" title={`Story Role: ${character.storyRole}`}>
                  {character.storyRole}
                </Badge>
              ) : null}
              <Badge
                variant={present ? "success" : "neutral"}
                size="xs"
                pill
              >
                {present ? "● In Scene" : "○ Off-Screen"}
              </Badge>
              <Badge
                variant="neutral"
                size="xs"
                title="Basic story character without full sheet"
                leftIcon={<Icon name="Sparkles" size={10} />}
              >
                Simple NPC
              </Badge>
            </div>
          </div>
        </div>
      )}

      {character.description ? (
        <p className="npc-desc">
          {character.description}
        </p>
      ) : character.memorySummary ? (
        <p className="npc-desc">
          {character.memorySummary}
        </p>
      ) : null}

      {/* Glanceable Metrics (Mood & Toward Player) */}
      {(character.mood || character.towardPlayer) && (
        <div className="char-metrics-grid">
          {character.mood ? (
            <div className="char-metric-pill" title={`Mood: ${character.mood}`}>
              <span className="metric-icon">
                <Icon name="Smile" size={12} />
              </span>
              <span className="metric-label">Mood:</span>
              <span className="metric-val">{character.mood}</span>
            </div>
          ) : null}

          {character.towardPlayer ? (
            <div className="char-metric-pill" title={`Toward Player: ${character.towardPlayer}`}>
              <span className="metric-icon">
                <Icon name="Heart" size={12} />
              </span>
              <span className="metric-label">Toward:</span>
              <span className="metric-val">{character.towardPlayer}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Conditions & Flags Chips */}
      {(character.conditions.length > 0 || character.flags.length > 0) && (
        <div className="char-status-section">
          {character.conditions.length > 0 && (
            <div className="conditions-grid">
              {character.conditions.map((c, i) => (
                <div key={i} className="condition-chip group flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon name="Zap" size={12} className="condition-icon shrink-0" />
                    <span className="condition-text truncate">{c}</span>
                  </div>
                  {onRemoveCondition ? (
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveCondition(i); }}
                      title="Remove condition"
                      aria-label={`Remove condition ${c}`}
                    >
                      <Icon name="X" size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {character.flags.length > 0 && (
            <div className="flags-chip-grid">
              {character.flags.map((f, i) => (
                <div key={i} className="flag-chip group flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon name="Bookmark" size={11} className="flag-icon shrink-0" />
                    <span className="flag-text truncate">{f}</span>
                  </div>
                  {onRemoveFlag ? (
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveFlag(i); }}
                      title="Remove flag"
                      aria-label={`Remove flag ${f}`}
                    >
                      <Icon name="X" size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Row */}
      <div className="char-actions-footer">
        {onEdit ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            disabled={isFleshingOut}
            leftIcon={<Icon name="Pencil" size={12} />}
            title="Edit character profile and notes"
          >
            Edit
          </Button>
        ) : <div />}

        {isFleshingOut ? (
          <span className="promote-actions flex items-center gap-1.5">
            <Button size="sm" variant="secondary" disabled leftIcon={<Icon name="Sparkles" size={13} className="sparkle-pulse" />}>
              Fleshing Out…
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={onFleshOut}
            leftIcon={<Icon name="Sparkles" size={13} />}
            title="Generate a full character sheet and promote to Detailed Character"
          >
            Flesh Out
          </Button>
        )}
      </div>
    </article>
  );
}

export function CharacterCard(props: {
  character: CharacterInstance;
  localTemplate?: CharacterTemplate;
  viewMode?: CastViewMode;
  inLibrary: boolean;
  feedback: SaveFeedback | null;
  saving: boolean;
  onSave: (mode: "update" | "newVersion") => void;
  onEdit: () => void;
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
    localTemplate,
    viewMode = "portrait",
    content,
    inLibrary,
    feedback,
    saving,
    onSave,
    onEdit,
    onOpenLibrary,
    present,
    libraryStale,
    readOnlySheet,
    onRemoveCondition,
    onRemoveFlag
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const templateId = character.templateId ?? "";
  const profileUrl = getCharacterAvatarUrl(templateId, "profile", localTemplate?.avatarUpdatedAt);
  const portraitUrl = getCharacterAvatarUrl(templateId, "portrait", localTemplate?.avatarUpdatedAt);

  return (
    <article className={`card playview-char-card mode-${viewMode}`}>
      {/* ── 1. Full Portrait View: Top Artwork Banner ── */}
      {viewMode === "portrait" && (
        <div className="char-portrait-banner-wrap">
          {!avatarFailed ? (
            <img
              src={portraitUrl}
              alt={`${character.name} portrait`}
              className="char-full-portrait-img"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <div className="char-portrait-fallback-header">
              <AvatarBadge src={profileUrl} name={character.name} size="lg" />
              <div className="char-fallback-text-wrap">
                <span className="char-fallback-title">{character.name}</span>
                <span className="char-no-art-hint">Detailed Character</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Card Header Row ── */}
      {viewMode === "compact" ? (
        <div className="char-compact-header-wrap">
          {/* Top Line: Avatar + Name + Presence */}
          <div className="char-compact-top-line">
            <AvatarBadge
              src={profileUrl}
              name={character.name}
              size="md"
              className="char-compact-avatar"
            />

            <div className="char-compact-name-row">
              <h4 className="char-name">{character.name}</h4>
              {character.storyRole ? (
                <Badge variant="accent" size="xs" title={`Story Role: ${character.storyRole}`}>
                  {character.storyRole}
                </Badge>
              ) : null}
              <Badge
                variant={present ? "success" : "neutral"}
                size="xs"
                pill
              >
                {present ? "● In Scene" : "○ Off-Screen"}
              </Badge>
            </div>
          </div>

          {/* Bottom Line: Badges */}
          <div className="char-badges-row compact-badges">
            {readOnlySheet ? (
              <Badge variant="info" size="xs">CCv2</Badge>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <Badge
                  variant="warning"
                  size="xs"
                  title="Playthrough changes differ from global library template"
                  leftIcon={<Icon name="AlertTriangle" size={11} />}
                >
                  Diverged
                </Badge>
              ) : (
                <Badge
                  variant="success"
                  size="xs"
                  title="Synced with Character Library"
                  leftIcon={<Icon name="Check" size={11} />}
                >
                  Library Linked
                </Badge>
              )
            ) : (
              <Badge variant="neutral" size="xs" title="Local to this playthrough">
                Local Cast
              </Badge>
            )}

            {inLibrary && onOpenLibrary && templateId && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenLibrary(templateId)}
                title="Open and edit global template in Character Library"
                leftIcon={<Icon name="ExternalLink" size={11} />}
              >
                Library
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="char-portrait-header-wrap">
          {/* Portrait Mode Header */}
          <div className="char-title-row">
            <h4 className="char-name">{character.name}</h4>
            {character.storyRole ? (
              <Badge variant="accent" size="xs" title={`Story Role: ${character.storyRole}`}>
                {character.storyRole}
              </Badge>
            ) : null}
            <Badge
              variant={present ? "success" : "neutral"}
              size="xs"
              pill
            >
              {present ? "● In Scene" : "○ Off-Screen"}
            </Badge>
          </div>

          <div className="char-badges-row">
            {readOnlySheet ? (
              <Badge variant="info" size="xs">CCv2 Sheet</Badge>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <Badge
                  variant="warning"
                  size="xs"
                  title="Playthrough changes differ from global library template"
                  leftIcon={<Icon name="AlertTriangle" size={11} />}
                >
                  Diverged from Library
                </Badge>
              ) : (
                <Badge
                  variant="success"
                  size="xs"
                  title="Synced with Character Library"
                  leftIcon={<Icon name="Check" size={11} />}
                >
                  Library Linked
                </Badge>
              )
            ) : (
              <Badge variant="neutral" size="xs" title="Local to this playthrough">
                Local Cast
              </Badge>
            )}

            {inLibrary && onOpenLibrary && templateId && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenLibrary(templateId)}
                title="Open and edit global template in Character Library"
                leftIcon={<Icon name="ExternalLink" size={11} />}
              >
                Open in Library
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Glanceable Metrics (Mood & Towards Player) */}
      <div className="char-metrics-grid">
        <div className="char-metric-pill" title={`Mood: ${character.mood || "neutral"}`}>
          <span className="metric-icon">
            <Icon name="Smile" size={12} />
          </span>
          <span className="metric-label">Mood:</span>
          <span className="metric-val">{character.mood || "neutral"}</span>
        </div>

        <div className="char-metric-pill" title={`Toward Player: ${character.towardPlayer || "neutral"}`}>
          <span className="metric-icon">
            <Icon name="Heart" size={12} />
          </span>
          <span className="metric-label">Toward:</span>
          <span className="metric-val">{character.towardPlayer || "neutral"}</span>
        </div>
      </div>

      {/* Conditions & Flags Chips */}
      {(character.conditions.length > 0 || character.flags.length > 0) && (
        <div className="char-status-section">
          {character.conditions.length > 0 && (
            <div className="conditions-grid">
              {character.conditions.map((c, i) => (
                <div key={i} className="condition-chip group flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon name="Zap" size={12} className="condition-icon shrink-0" />
                    <span className="condition-text truncate">{c}</span>
                  </div>
                  {onRemoveCondition ? (
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveCondition(i); }}
                      title="Remove condition"
                      aria-label={`Remove condition ${c}`}
                    >
                      <Icon name="X" size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {character.flags.length > 0 && (
            <div className="flags-chip-grid">
              {character.flags.map((f, i) => (
                <div key={i} className="flag-chip group flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon name="Bookmark" size={11} className="flag-icon shrink-0" />
                    <span className="flag-text truncate">{f}</span>
                  </div>
                  {onRemoveFlag ? (
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveFlag(i); }}
                      title="Remove flag"
                      aria-label={`Remove flag ${f}`}
                    >
                      <Icon name="X" size={10} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Details Drawer (Body, Appearance, Clothing) */}
      <div className={`char-details-drawer ${drawerOpen ? "is-open" : "is-closed"}`}>
        <button
          type="button"
          className="drawer-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-expanded={drawerOpen}
        >
          <span className="toggle-left">
            <Icon name="Shirt" size={13} />
            <span>Physical &amp; Clothing Details</span>
            {character.clothing.length > 0 && (
              <span className="drawer-item-count">({character.clothing.length})</span>
            )}
          </span>
          <Icon name={drawerOpen ? "ChevronUp" : "ChevronDown"} size={13} />
        </button>

        {drawerOpen && (
          <div className="drawer-expanded-body">
            {content ? <CharacterSheetSections content={content} /> : null}

            {character.clothing.length > 0 ? (
              <div className="char-clothing-block">
                <h5 className="subcard-title flex items-center gap-1">
                  <Icon name="Shirt" size={11} /> Equipped Clothing
                </h5>
                <div className="clothing-chip-grid">
                  {character.clothing.map((c, i) => (
                    <div key={i} className="clothing-chip">
                      <span className="clothing-slot">{c.slot}:</span>
                      <span className="clothing-name">{c.name}</span>
                      {c.state ? <span className="clothing-state">({c.state})</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="no-clothing-hint">No specific clothing registered.</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Action Row */}
      <div className="char-actions-footer">
        <Button size="sm" variant="secondary" onClick={onEdit} leftIcon={<Icon name="FileText" size={13} />}>
          Full Sheet
        </Button>

        <div className="library-sync-actions">
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
        </div>

        {feedback ? (
          <span className={`save-feedback-toast ${feedback.ok ? "saved-flash" : "save-error"}`}>
            {feedback.text}
          </span>
        ) : null}
      </div>
    </article>
  );
}
