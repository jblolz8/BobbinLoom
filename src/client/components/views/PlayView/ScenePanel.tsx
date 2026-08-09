import { useState } from "react";
import type { Playthrough, Quest } from "../../../../schemas";
import type { QuestAction } from "../../../api";
import { MiniMap } from "../../common/MiniMap";

export type ScenePanelProps = {
  playthrough: Playthrough;
  actionLoading: boolean;
  onQuestAction: (questId: string, action: QuestAction, name?: string, summary?: string) => void;
  className?: string;
};

type EditState = {
  questId: string;
  name: string;
  summary: string;
} | null;

type DeleteConfirm = {
  questId: string;
  name: string;
} | null;

function visibleQuests(quests: Quest[]): Quest[] {
  return quests.filter((q) => q.tracking || q.status === "active");
}

export function ScenePanel({ playthrough, actionLoading, onQuestAction, className }: ScenePanelProps) {
  const [editing, setEditing] = useState<EditState>(null);
  const [deleting, setDeleting] = useState<DeleteConfirm>(null);

  function handleToggle(questId: string) {
    onQuestAction(questId, "toggleTracking");
  }

  function handleDelete() {
    if (!deleting) return;
    onQuestAction(deleting.questId, "delete");
    setDeleting(null);
  }

  function handleEditSave() {
    if (!editing) return;
    onQuestAction(editing.questId, "edit", editing.name, editing.summary);
    setEditing(null);
  }

  const quests = visibleQuests(playthrough.quests);
  const currentLocation = playthrough.locationCatalog?.find((l) => l.id === playthrough.locationId);

  return (
    <aside className={`panel left-panel${className ? ` ${className}` : ""}`}>
      <MiniMap
        locations={playthrough.locationCatalog ?? []}
        currentLocationId={playthrough.locationId}
      />
      <h2>Scene</h2>
      <p><strong>Location:</strong> {currentLocation ? currentLocation.name : playthrough.locationId}</p>
      <p><strong>Turn:</strong> {playthrough.turn}</p>

      <h3>Flags</h3>
      {playthrough.flags.length ? <ul>{playthrough.flags.map((f) => <li key={f}>{f}</li>)}</ul> : <p>No flags yet.</p>}

      <h3>Quests</h3>
      {quests.length === 0 ? (
        <p>No quests yet — they'll appear as the story develops.</p>
      ) : (
        quests.map((quest) => (
          <div key={quest.id} className="quest-row">
            <input
              type="checkbox"
              checked={quest.tracking}
              onChange={() => handleToggle(quest.id)}
              disabled={actionLoading}
              title={quest.tracking ? "Untrack quest" : "Track quest"}
            />
            <div className="quest-info">
              <span className="quest-name">{quest.name}</span>
              <span className="quest-status">{quest.status}</span>
              <span className="quest-summary">{quest.summary}</span>
            </div>
            <button
              className="quest-icon-btn"
              disabled={actionLoading}
              onClick={() => setEditing({ questId: quest.id, name: quest.name, summary: quest.summary })}
              title="Edit quest"
            >
              ✏
            </button>
            <button
              className="quest-icon-btn quest-delete-btn"
              disabled={actionLoading}
              onClick={() => setDeleting({ questId: quest.id, name: quest.name })}
              title="Abandon quest"
            >
              ✕
            </button>
          </div>
        ))
      )}

      {editing ? (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <section className="modal quest-edit-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Edit Quest</h2>
            </header>
            <div className="settings-form">
              <label>
                Name
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                Summary
                <textarea
                  value={editing.summary}
                  onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                  rows={3}
                />
              </label>
            </div>
            <div className="settings-actions">
              <button className="primary-btn" onClick={handleEditSave} disabled={actionLoading || !editing.name.trim()}>
                Save
              </button>
              <button onClick={() => setEditing(null)} disabled={actionLoading}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {deleting ? (
        <div className="modal-backdrop" onClick={() => setDeleting(null)}>
          <section className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div>
                <h2>Abandon Quest?</h2>
                <p>This will permanently remove <strong>{deleting.name}</strong> from your quest list and log it in the chat.</p>
              </div>
            </header>
            <div className="settings-actions">
              <button className="danger" onClick={handleDelete} disabled={actionLoading}>Yes, abandon</button>
              <button onClick={() => setDeleting(null)} disabled={actionLoading}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
