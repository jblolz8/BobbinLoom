import { useEffect, useRef, useState } from "react";
import type { CharacterInstance, CharacterTemplate, Playthrough } from "../../../../../schemas";
import { editCharacter, listCharacters, promoteNpc, promoteNpcDraft, saveCharacterToLibrary } from "../../../../api";
import type { CharacterEditPayload, PromoteDraftResult } from "../../../../api";
import { CharacterEditor } from "../../../modals/CharacterEditor";
import { PromotePreview } from "../../../common/PromotePreview";
import { CharacterSheetSections } from "./CharacterSheetSections";

type SaveFeedback = { ok: boolean; text: string };

export function CharsTab({ playthrough, onPlaythroughChange }: { playthrough: Playthrough; onPlaythroughChange: (p: Playthrough) => void }) {
  const [library, setLibrary] = useState<CharacterTemplate[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<Record<string, SaveFeedback>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingChar, setEditingChar] = useState<CharacterInstance | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromoteDraftResult | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const draftAbortRef = useRef<AbortController | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

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

  return (
    <>
      <h2>Main Cast</h2>
      {playthrough.characters.length === 0 ? (
        <p>No main cast yet — background characters can be promoted as the story develops.</p>
      ) : (
        playthrough.characters.map((character) => {
          const localTpl = playthrough.characterTemplates.find((t) => t.id === character.templateId);
          const libTpl = library.find((t) => t.id === character.templateId);
          const libraryStale = !!localTpl && !!libTpl
            && JSON.stringify({ content: localTpl.content, summary: localTpl.summary, startingClothing: localTpl.startingClothing })
            !== JSON.stringify({ content: libTpl.content, summary: libTpl.summary, startingClothing: libTpl.startingClothing });
          return (
            <CharacterCard
              key={character.id}
              character={character}
              content={localTpl?.content ?? ""}
              inLibrary={library.some((t) => t.id === character.templateId)}
              present={character.currentLocationId === playthrough.locationId}
              locationName={playthrough.locationCatalog?.find((l) => l.id === character.currentLocationId)?.name ?? character.currentLocationId}
              libraryStale={libraryStale}
              feedback={saveFeedback[character.id] ?? null}
              saving={savingId === character.id}
              onSave={(mode) => { void handleSave(character.id, mode); }}
              onEdit={() => setEditingChar(character)}
            />
          );
        })
      )}

      <h2>Background</h2>
      {playthrough.npcs.length === 0 ? (
        <p>No background characters yet.</p>
      ) : (
        <ul className="background-roster">
          {playthrough.npcs.map((npc) => (
            <li key={npc.id}>
              <strong>{npc.name}</strong>{npc.disposition ? ` (${npc.disposition})` : ""} — {npc.description}
              {draftingId === npc.id ? (
                <span className="promote-actions">
                  <button disabled>Generating draft…</button>
                  <button onClick={() => { draftAbortRef.current?.abort(); setDraftingId(null); }}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => handleStartPromote(npc.id)}>Convert to Detailed</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {promoteError ? (
        <p className="promote-error">
          {promoteError}
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
    </>
  );
}

export function CharacterCard(props: {
  character: CharacterInstance;
  inLibrary: boolean;
  feedback: SaveFeedback | null;
  saving: boolean;
  onSave: (mode: "update" | "newVersion") => void;
  onEdit: () => void;
  content: string;
  present: boolean;
  locationName: string;
  libraryStale: boolean;
}) {
  const { character, content, inLibrary, feedback, saving, onSave, onEdit, present, locationName, libraryStale } = props;

  return (
    <article className="card character-card">
      <h3>{character.name}</h3>
      <p className="presence-badge">{present ? "● present" : "○ away"} · at {locationName}</p>
      <CharacterSheetSections content={content} />
      <p><strong>Mood:</strong> {character.mood}</p>
      <p><strong>Towards Player:</strong> {character.towardPlayer}</p>
      {character.conditions.length > 0 ? (
        <p><strong>Conditions:</strong> {character.conditions.join(", ")}</p>
      ) : null}
      <p className="memory-preview"><strong>Memory:</strong> {character.memorySummary.slice(0, 120)}{character.memorySummary.length > 120 ? "…" : ""}</p>
      {inLibrary && libraryStale ? <span className="lib-badge stale">library copy out of date</span> : null}
      <div className="save-library-row">
        <button onClick={onEdit}>View Full Sheet</button>
        {inLibrary ? (
          <>
            <button disabled={saving} onClick={() => onSave("update")}>{saving ? "Saving…" : "Update Library Copy"}</button>
            <button disabled={saving} onClick={() => onSave("newVersion")}>{saving ? "Saving…" : "Save as New Version"}</button>
          </>
        ) : (
          <button disabled={saving} onClick={() => onSave("update")}>{saving ? "Saving…" : "Save to Library"}</button>
        )}
        {feedback ? (
          <span className={feedback.ok ? "saved-flash" : "save-error"}>{feedback.text}</span>
        ) : null}
      </div>
    </article>
  );
}
