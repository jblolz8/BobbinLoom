import { useEffect, useState } from "react";
import type { Playthrough } from "../../../schemas";
import { listPlaythroughs, renamePlaythrough, type PlaythroughSummary } from "../../api";
import { PlaythroughActionsMenu } from "../common/PlaythroughActionsMenu";

export type SaveLoadModalProps = {
  open: boolean;
  onClose: () => void;
  currentPlaythroughId: string;
  onLoad: (id: string) => void;
  /** Ids of the playthroughs still present, in list order — the caller loads the first one.
   *  Ids and not documents: this list is a projection, not full playthroughs. */
  onCurrentDeleted: (remainingIds: string[]) => void;
  onCurrentRenamed: (updated: Playthrough) => void;
  onError: (message: string) => void;
};

export function SaveLoadModal(props: SaveLoadModalProps) {
  const { open, onClose, currentPlaythroughId, onLoad, onCurrentDeleted, onCurrentRenamed, onError } = props;
  const [allPlaythroughs, setAllPlaythroughs] = useState<PlaythroughSummary[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function loadList() {
    listPlaythroughs()
      .then((res) => setAllPlaythroughs(res.playthroughs))
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    if (!open) return;
    setRenamingId(null);
    loadList();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRenameRequest(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  async function confirmRename(id: string) {
    if (!renameDraft.trim()) return;
    try {
      const updated = await renamePlaythrough(id, renameDraft.trim());
      // The route answers with the whole document; keep only what the projection holds.
      setAllPlaythroughs((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: updated.name, updatedAt: updated.updatedAt } : p))
      );
      if (currentPlaythroughId === id) onCurrentRenamed(updated);
      setRenamingId(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  // The clone is not a summary, so re-read the list instead of inventing an entry for it.
  function handleDuplicated() {
    loadList();
  }

  function handleDeleted(id: string) {
    const remaining = allPlaythroughs.filter((p) => p.id !== id);
    setAllPlaythroughs(remaining);
    if (currentPlaythroughId === id) {
      onCurrentDeleted(remaining.map((p) => p.id));
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal save-load-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Playthroughs (Save / Load)</h2>
          <button onClick={onClose}>Close</button>
        </header>
        {allPlaythroughs.length === 0 ? (
          <p className="empty-chat">No playthroughs found.</p>
        ) : (
          <ul className="save-list">
            {allPlaythroughs.map((p) => (
              <li key={p.id} className={`save-item ${p.id === currentPlaythroughId ? "current" : ""}`}>
                <div className="save-item-info">
                  {renamingId === p.id ? (
                    <input
                      className="rename-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void confirmRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
                      autoFocus
                    />
                  ) : (
                    <strong>{p.name}</strong>
                  )}
                  <span className="save-meta">Turn {p.turn} — {new Date(p.updatedAt).toLocaleString()}</span>
                  {p.id === currentPlaythroughId ? <span className="save-badge">Current</span> : null}
                </div>
                <div className="save-item-actions">
                  {p.id !== currentPlaythroughId ? (
                    <button onClick={() => { onLoad(p.id); onClose(); }}>Load</button>
                  ) : null}
                  {renamingId === p.id ? (
                    <>
                      <button onClick={() => void confirmRename(p.id)}>Save</button>
                      <button onClick={() => setRenamingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <PlaythroughActionsMenu
                      playthroughId={p.id}
                      playthroughName={p.name}
                      onRenameRequest={handleRenameRequest}
                      onDuplicated={handleDuplicated}
                      onDeleted={() => handleDeleted(p.id)}
                      onError={onError}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export const PlaythroughsModal = SaveLoadModal;
