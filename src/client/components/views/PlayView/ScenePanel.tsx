import { useState } from "react";
import type { Playthrough, Quest } from "../../../../schemas";
import type { QuestAction } from "../../../api";
import { MiniMap } from "../../common/MiniMap";
import { ConfirmModal } from "../../common/ConfirmModal";
import { Badge, Button, Checkbox, Icon, TextArea, TextInput } from "../../base";

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
              <Badge variant="accent" size="sm">#{playthrough.turn}</Badge>
            </div>

            {currentLocation?.description ? (
              <p className="scene-location-description">{currentLocation.description}</p>
            ) : null}
          </div>
        </article>

        <MiniMap
          locations={playthrough.locationCatalog ?? []}
          currentLocationId={playthrough.locationId}
        />

        <section className="scene-section">
          <h3 className="section-subtitle flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="Flag" size={15} /> World Flags
            </span>
            <Badge variant="neutral" size="xs" pill>{playthrough.flags.length}</Badge>
          </h3>
          {playthrough.flags.length > 0 ? (
            <div className="flags-grid">
              {playthrough.flags.map((f) => (
                <div key={f} className="flag-chip" title={f}>
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
            <Badge variant="neutral" size="xs" pill>{quests.length}</Badge>
          </h3>
          {quests.length > 0 ? (
            <div className="quests-container">
              {quests.map((quest) => (
                <div key={quest.id} className={`quest-card ${quest.tracking ? "tracking" : ""}`}>
                  <div className="quest-card-header">
                    <Checkbox
                      checked={quest.tracking}
                      onChange={() => handleToggle(quest.id)}
                      disabled={actionLoading}
                      label={<strong className="quest-title">{quest.name}</strong>}
                      containerClassName="quest-checkbox-label"
                      title={quest.tracking ? "Untrack quest" : "Track quest"}
                    />
                  </div>

                  {quest.summary ? <p className="quest-summary">{quest.summary}</p> : null}

                  <div className="quest-card-actions">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={actionLoading}
                      onClick={() => setEditing({ questId: quest.id, name: quest.name, summary: quest.summary })}
                      leftIcon={<Icon name="Pencil" size={12} />}
                      title="Edit quest"
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-danger hover:bg-danger-subtle"
                      disabled={actionLoading}
                      onClick={() => setDeleting({ questId: quest.id, name: quest.name })}
                      leftIcon={<Icon name="Trash2" size={12} />}
                      title="Abandon quest"
                    >
                      Abandon
                    </Button>
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
        <ConfirmModal
          title="Edit Quest"
          confirmLabel="Save Changes"
          confirmDisabled={!editing.name.trim()}
          isLoading={actionLoading}
          onConfirm={handleEditSave}
          onCancel={() => setEditing(null)}
          maxWidth={460}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Quest Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              disabled={actionLoading}
              autoFocus
            />
            <TextArea
              label="Summary"
              value={editing.summary}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              rows={3}
              disabled={actionLoading}
            />
          </div>
        </ConfirmModal>
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Abandon Quest?"
          message={<>This will permanently remove <strong>{deleting.name}</strong> from your quest list and log it in the chat.</>}
          confirmLabel="Yes, abandon"
          danger
          isLoading={actionLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </aside>
  );
}
