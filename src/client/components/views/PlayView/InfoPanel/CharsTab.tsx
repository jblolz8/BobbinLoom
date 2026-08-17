import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterInstance, CharacterTemplate, Playthrough } from "../../../../../schemas";
import { editCharacter, getCharacterAvatarUrl, listCharacters, promoteNpc, promoteNpcDraft, saveCharacterToLibrary } from "../../../../api";
import type { CharacterEditPayload, PromoteDraftResult } from "../../../../api";
import { CharacterEditor } from "../../../modals/CharacterEditor";
import { PromotePreview } from "../../../common/PromotePreview";
import { CharacterSheetSections } from "./CharacterSheetSections";
import { AvatarBadge, Icon, SearchBar } from "../../../base";

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
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromoteDraftResult | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const draftAbortRef = useRef<AbortController | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [npcSearch, setNpcSearch] = useState("");
  const [castViewMode, setCastViewModeState] = useState<CastViewMode>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_cast_view_mode");
      if (saved === "portrait" || saved === "compact") return saved;
    }
    return "portrait";
  });

  const setCastViewMode = (mode: CastViewMode) => {
    setCastViewModeState(mode);
    try {
      localStorage.setItem("bobbinloom_cast_view_mode", mode);
    } catch {
      /* silent */
    }
  };

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

  async function requestDraft(npcId: string) {
    draftAbortRef.current?.abort();
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setPromoteError(null);
    try {
      const result = await promoteNpcDraft(playthrough.id, npcId, controller.signal);
      if (draftAbortRef.current === controller) setDraft(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // cancelled
      } else if (draftAbortRef.current === controller) {
        setPromoteError(e instanceof Error ? e.message : "Failed to generate draft");
      }
    } finally {
      if (draftAbortRef.current === controller) {
        draftAbortRef.current = null;
        setDraftingId(null);
      }
    }
  }

  function handleStartPromote(npcId: string) {
    if (draftingId !== null || draft) return;
    setDraftingId(npcId);
    void requestDraft(npcId);
  }

  async function handleConfirmPromote() {
    if (!draft) return;
    const controller = new AbortController();
    setPromoteBusy(true);
    setPromoteError(null);
    try {
      const updated = await promoteNpc(playthrough.id, draft.npc.id, draft.content, controller.signal);
      onPlaythroughChange(updated);
      setDraft(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setPromoteError(e instanceof Error ? e.message : "Promotion failed");
      }
    } finally {
      setPromoteBusy(false);
    }
  }

  function handleRegenerate() {
    if (!draft) return;
    setPromoteBusy(true);
    void requestDraft(draft.npc.id).finally(() => setPromoteBusy(false));
  }

  function handleCancelPromote() {
    if (promoteBusy) return;
    draftAbortRef.current?.abort();
    setDraft(null);
    setDraftingId(null);
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

  const filteredNpcs = useMemo(() => {
    if (!npcSearch.trim()) return playthrough.npcs;
    const q = npcSearch.toLowerCase().trim();
    return playthrough.npcs.filter(
      (n) => n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) || (n.disposition && n.disposition.toLowerCase().includes(q))
    );
  }, [playthrough.npcs, npcSearch]);

  return (
    <div className="chars-tab-container">
      <section className="chars-section">
        <div className="main-cast-header-row">
          <div className="section-title-wrap">
            <Icon name="Users" size={14} />
            <span className="section-title-text">Main Cast</span>
            <span className="badge-count">{playthrough.characters.length}</span>
          </div>

          {playthrough.characters.length > 0 && (
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
          )}
        </div>

        {playthrough.characters.length === 0 ? (
          <p className="info-empty-state">No main cast yet — background characters can be promoted as the story develops.</p>
        ) : (
          <div className={`chars-cards-list mode-${castViewMode}`}>
            {playthrough.characters.map((character) => {
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
                  present={character.currentLocationId === playthrough.locationId}
                  locationName={playthrough.locationCatalog?.find((l) => l.id === character.currentLocationId)?.name ?? character.currentLocationId}
                  libraryStale={libraryStale}
                  readOnlySheet={isCcv2}
                  feedback={saveFeedback[character.id] ?? null}
                  saving={savingId === character.id}
                  onSave={(mode) => { void handleSave(character.id, mode); }}
                  onEdit={() => setEditingChar(character)}
                  onOpenLibrary={onOpenLibrary}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="chars-section background-section">
        <div className="background-header-row">
          <div className="section-title-wrap">
            <Icon name="UserCheck" size={14} />
            <span className="section-title-text">Background</span>
            <span className="badge-count">{playthrough.npcs.length}</span>
          </div>

          {playthrough.npcs.length > 3 && (
            <SearchBar
              value={npcSearch}
              onChange={setNpcSearch}
              placeholder="Filter NPCs…"
              size="sm"
              containerClassName="npc-search-wrapper"
            />
          )}
        </div>

        {playthrough.npcs.length === 0 ? (
          <p className="info-empty-state">No background characters yet.</p>
        ) : filteredNpcs.length === 0 ? (
          <p className="info-empty-state">No NPCs matching &quot;{npcSearch}&quot;.</p>
        ) : (
          <div className="background-roster-grid">
            {filteredNpcs.map((npc) => (
              <div key={npc.id} className="npc-card-item">
                <div className="npc-header-row">
                  <AvatarBadge name={npc.name} size="xs" />
                  <div className="npc-title-wrap">
                    <strong className="npc-name">{npc.name}</strong>
                    {npc.disposition ? (
                      <span className="npc-disposition-tag">{npc.disposition}</span>
                    ) : null}
                  </div>
                </div>

                <p className="npc-desc">{npc.description}</p>

                <div className="npc-actions">
                  {draftingId === npc.id ? (
                    <span className="promote-actions">
                      <button type="button" className="btn-drafting" disabled>
                        <Icon name="Sparkles" size={13} className="sparkle-pulse" /> Drafting…
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => { draftAbortRef.current?.abort(); setDraftingId(null); }}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="promote-npc-btn"
                      onClick={() => handleStartPromote(npc.id)}
                    >
                      <Icon name="Sparkles" size={13} /> Promote to Detailed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {promoteError ? (
        <p className="promote-error">
          <Icon name="AlertTriangle" size={14} /> {promoteError}
          <button className="dismiss" onClick={() => setPromoteError(null)} aria-label="Dismiss">×</button>
        </p>
      ) : null}

      {draft ? (
        <PromotePreview
          npc={draft.npc}
          content={draft.content}
          busy={promoteBusy}
          onConfirm={() => void handleConfirmPromote()}
          onRegenerate={() => void handleRegenerate()}
          onCancel={handleCancelPromote}
        />
      ) : null}

      {editingChar ? (
        <CharacterEditor
          character={editingChar}
          playthrough={playthrough}
          inLibrary={library.some((t) => t.id === editingChar.templateId)}
          initialMode="view"
          onSave={(payload) => handleEditSave(payload)}
          onSaveToLibrary={(mode) => handleEditorSaveToLibrary(mode)}
          onClose={() => setEditingChar(null)}
        />
      ) : null}
    </div>
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
  locationName: string;
  libraryStale: boolean;
  readOnlySheet: boolean;
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
    locationName,
    libraryStale,
    readOnlySheet,
  } = props;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const profileUrl = getCharacterAvatarUrl(character.templateId, "profile", localTemplate?.avatarUpdatedAt);
  const portraitUrl = getCharacterAvatarUrl(character.templateId, "portrait", localTemplate?.avatarUpdatedAt);

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
            <div className="char-portrait-fallback">
              <Icon name="Image" size={32} />
              <span>{character.name}</span>
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
              <span className={`presence-pill ${present ? "is-present" : "is-away"}`}>
                {present ? "● Present" : "○ Away"} · at {locationName}
              </span>
            </div>
          </div>

          {/* Bottom Line: Badges */}
          <div className="char-badges-row compact-badges">
            {readOnlySheet ? (
              <span className="ccv2-readonly-badge">CCv2</span>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <span className="lib-badge stale" title="Playthrough changes differ from global library template">
                  <Icon name="AlertTriangle" size={11} /> Diverged
                </span>
              ) : (
                <span className="lib-badge synced" title="Synced with Character Library">
                  <Icon name="Check" size={11} /> Library Linked
                </span>
              )
            ) : (
              <span className="lib-badge local" title="Local to this playthrough">
                Local Cast
              </span>
            )}

            {inLibrary && onOpenLibrary && (
              <button
                type="button"
                className="open-library-btn"
                onClick={() => onOpenLibrary(character.templateId)}
                title="Open and edit global template in Character Library"
              >
                <Icon name="ExternalLink" size={11} /> Library
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="char-portrait-header-wrap">
          {/* Portrait Mode Header */}
          <div className="char-title-row">
            <h4 className="char-name">{character.name}</h4>
            <span className={`presence-pill ${present ? "is-present" : "is-away"}`}>
              {present ? "● Present" : "○ Away"} · at {locationName}
            </span>
          </div>

          <div className="char-badges-row">
            {readOnlySheet ? (
              <span className="ccv2-readonly-badge">CCv2 Sheet</span>
            ) : null}

            {inLibrary ? (
              libraryStale ? (
                <span className="lib-badge stale" title="Playthrough changes differ from global library template">
                  <Icon name="AlertTriangle" size={11} /> Diverged from Library
                </span>
              ) : (
                <span className="lib-badge synced" title="Synced with Character Library">
                  <Icon name="Check" size={11} /> Library Linked
                </span>
              )
            ) : (
              <span className="lib-badge local" title="Local to this playthrough">
                Local Cast
              </span>
            )}

            {inLibrary && onOpenLibrary && (
              <button
                type="button"
                className="open-library-btn"
                onClick={() => onOpenLibrary(character.templateId)}
                title="Open and edit global template in Character Library"
              >
                <Icon name="ExternalLink" size={11} /> Open in Library
              </button>
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
                <div key={i} className="condition-chip">
                  <Icon name="Zap" size={12} className="condition-icon" />
                  <span className="condition-text">{c}</span>
                </div>
              ))}
            </div>
          )}

          {character.flags.length > 0 && (
            <div className="flags-chip-grid">
              {character.flags.map((f, i) => (
                <div key={i} className="flag-chip">
                  <Icon name="Bookmark" size={11} className="flag-icon" />
                  <span className="flag-text">{f}</span>
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
        <button type="button" className="btn-sheet" onClick={onEdit}>
          <Icon name="FileText" size={13} /> Full Sheet
        </button>

        <div className="library-sync-actions">
          {inLibrary ? (
            <>
              <button
                type="button"
                className="btn-sync update"
                disabled={saving}
                onClick={() => onSave("update")}
                title="Update the existing Character Library template"
              >
                {saving ? "Saving…" : "Update Library"}
              </button>
              <button
                type="button"
                className="btn-sync version"
                disabled={saving}
                onClick={() => onSave("newVersion")}
                title="Save as a new version in the Character Library"
              >
                {saving ? "Saving…" : "New Version"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-sync create"
              disabled={saving}
              onClick={() => onSave("update")}
              title="Save this character to the Character Library"
            >
              {saving ? "Saving…" : "Save to Library"}
            </button>
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
