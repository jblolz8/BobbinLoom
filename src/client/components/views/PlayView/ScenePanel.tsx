import { useState } from "react";
import type { Playthrough, Quest } from "../../../../schemas";
import type { QuestAction } from "../../../api";
import { MiniMap } from "../../common/MiniMap";
import { Icon } from "../../base";

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

      <div className="scene-panel-content">
        <article className="card scene-overview-card">
          <div className="scene-card-header">
            <div className="scene-avatar-badge">
              <Icon name="Compass" size={18} />
            </div>
            <div>
              <h3 className="scene-title">Scene Overview</h3>
              <p className="scene-subtitle-text">Current environment status</p>
            </div>
          </div>

          <div className="scene-meta-grid">
            <div className="scene-meta-item">
              <span className="meta-label"><Icon name="MapPin" size={13} /> Location</span>
              <span className="meta-val flex items-center gap-1">
                {currentLocation?.icon ? <span className="location-icon">{currentLocation.icon}</span> : null}
                <strong>{currentLocation ? currentLocation.name : playthrough.locationId}</strong>
              </span>
            </div>

            <div className="scene-meta-item">
              <span className="meta-label"><Icon name="Clock" size={13} /> Turn</span>
              <span className="meta-val turn-badge">#{playthrough.turn}</span>
            </div>
          </div>
        </article>

        <section className="scene-section">
          <h3 className="section-subtitle flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="Flag" size={15} /> World Flags
            </span>
            <span className="badge-count">{playthrough.flags.length}</span>
          </h3>
          {playthrough.flags.length > 0 ? (
            <div className="flags-grid">
              {playthrough.flags.map((f) => (
                <div key={f} className="flag-chip">
                  <Icon name="Flag" size={13} className="flag-chip-icon" />
                  <span className="flag-chip-text">{f}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="info-empty-state">
              <Icon name="BookmarkCheck" size={15} />
              <span>No active world flags</span>
            </div>
          )}
        </section>

        <section className="scene-section">
          <h3 className="section-subtitle flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="Scroll" size={15} /> Quests
            </span>
            <span className="badge-count">{quests.length}</span>
          </h3>
          {quests.length > 0 ? (
            <div className="quests-container">
              {quests.map((quest) => (
                <div key={quest.id} className={`quest-card ${quest.tracking ? "tracking" : ""}`}>
                  <div className="quest-card-header">
                    <label className="quest-checkbox-label" title={quest.tracking ? "Untrack quest" : "Track quest"}>
                      <input
                        type="checkbox"
                        checked={quest.tracking}
                        onChange={() => handleToggle(quest.id)}
                        disabled={actionLoading}
                      />
                      <strong className="quest-title">{quest.name}</strong>
                    </label>
                    <span className={`quest-status-badge ${quest.status}`}>{quest.status}</span>
                  </div>

                  {quest.summary ? <p className="quest-summary">{quest.summary}</p> : null}

                  <div className="quest-card-actions">
                    <button
                      className="quest-action-btn flex items-center gap-1"
                      disabled={actionLoading}
                      onClick={() => setEditing({ questId: quest.id, name: quest.name, summary: quest.summary })}
                      title="Edit quest"
                    >
                      <Icon name="Pencil" size={13} /> Edit
                    </button>
                    <button
                      className="quest-action-btn danger flex items-center gap-1"
                      disabled={actionLoading}
                      onClick={() => setDeleting({ questId: quest.id, name: quest.name })}
                      title="Abandon quest"
                    >
                      <Icon name="Trash2" size={13} /> Abandon
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="info-empty-state">
              <Icon name="BookOpen" size={15} />
              <span>No quests active</span>
            </div>
          )}
        </section>
      </div>

      {editing ? (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <section className="modal quest-edit-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Edit Quest</h2>
              <button className="flex items-center gap-1" onClick={() => setEditing(null)}>
                <Icon name="X" size={16} /> Close
              </button>
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
            <div className="settings-actions flex items-center gap-2 mt-4">
              <button className="primary-btn flex items-center gap-1.5" onClick={handleEditSave} disabled={actionLoading || !editing.name.trim()}>
                <Icon name="Save" size={15} /> Save Changes
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
              <button className="flex items-center gap-1" onClick={() => setDeleting(null)}>
                <Icon name="X" size={16} />
              </button>
            </header>
            <div className="settings-actions flex items-center gap-2 mt-4">
              <button className="danger flex items-center gap-1.5" onClick={handleDelete} disabled={actionLoading}>
                <Icon name="Trash2" size={15} /> Yes, abandon
              </button>
              <button onClick={() => setDeleting(null)} disabled={actionLoading}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
