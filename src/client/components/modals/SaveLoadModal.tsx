import { useEffect, useState } from "react";
import type { Playthrough } from "../../../schemas";
import { listPlaythroughs, renamePlaythrough } from "../../api";
import { PlaythroughActionsMenu } from "../common/PlaythroughActionsMenu";

export type SaveLoadModalProps = {
  open: boolean;
  onClose: () => void;
  currentPlaythroughId: string;
  onLoad: (id: string) => void;
  onCurrentDeleted: (remaining: Playthrough[]) => void;
  onCurrentRenamed: (updated: Playthrough) => void;
  onError: (message: string) => void;
};

export function SaveLoadModal(props: SaveLoadModalProps) {
  const { open, onClose, currentPlaythroughId, onLoad, onCurrentDeleted, onCurrentRenamed, onError } = props;
  const [allPlaythroughs, setAllPlaythroughs] = useState<Playthrough[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setRenamingId(null);
    listPlaythroughs()
      .then((res) => setAllPlaythroughs(res.playthroughs))
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRenameRequest(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  async function confirmRename(id: string) {
    if (!renameDraft.trim()) return;
    try {
      const updated = await renamePlaythrough(id, renameDraft.trim());
      setAllPlaythroughs((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (currentPlaythroughId === id) onCurrentRenamed(updated);
      setRenamingId(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDuplicated(clone: Playthrough) {
    setAllPlaythroughs((prev) => [clone, ...prev]);
  }

  function handleDeleted(id: string) {
    const remaining = allPlaythroughs.filter((p) => p.id !== id);
    setAllPlaythroughs(remaining);
    if (currentPlaythroughId === id) {
      onCurrentDeleted(remaining);
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
