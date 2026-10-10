import type { CSSProperties } from "react";
import { useState } from "react";
import type { Playthrough, WorldStateEntry } from "../../../../schemas";
import type { WorldStateAction } from "../../../api";
import { ConfirmModal } from "../../common/ConfirmModal";
import { Badge, Button, Icon, TextArea, TextInput } from "../../base";

export type ScenePanelProps = {
  playthrough: Playthrough;
  actionLoading: boolean;
  onWorldStateAction: (wsId: string, action: WorldStateAction, name?: string, description?: string) => void;
  className?: string;
  style?: CSSProperties;
};

type EditState = {
  id: string;
  name: string;
  description: string;
} | null;

type DeleteConfirm = {
  id: string;
  name: string;
} | null;

export function ScenePanel({ playthrough, actionLoading, onWorldStateAction, className, style }: ScenePanelProps) {
  const [editing, setEditing] = useState<EditState>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [deleting, setDeleting] = useState<DeleteConfirm>(null);

  function handleDelete() {
    if (!deleting) return;
    onWorldStateAction(deleting.id, "delete");
    setDeleting(null);
  }

  function handleEditSave() {
    if (!editing) return;
    onWorldStateAction(editing.id, "edit", editing.name, editing.description);
    setEditing(null);
  }

  function handleAddSave() {
    onWorldStateAction("new", "add", addName, addDescription);
    setIsAdding(false);
    setAddName("");
    setAddDescription("");
  }

  const worldState = playthrough.worldState || [];
  const activeCount = (playthrough.activeCharacters ?? []).length;
  const storyMessages = (playthrough.messages ?? []).filter((m) => !m.hidden || m.chapterId);
  const userMsgCount = storyMessages.filter((m) => m.role === "user").length;
  const aiMsgCount = storyMessages.filter((m) => m.role === "assistant").length;
  const totalMsgCount = storyMessages.length;

  return (
    <aside className={`panel left-panel${className ? ` ${className}` : ""}`} style={style}>
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
              <span className="meta-label"><Icon name="Clock" size={13} /> Turn</span>
              <Badge variant="accent" size="sm">#{playthrough.turn}</Badge>
            </div>

            <div className="scene-meta-item scene-meta-messages">
              <span className="meta-label"><Icon name="MessageSquare" size={13} /> Messages</span>
              <div className="scene-meta-stat-group">
                <Badge variant="neutral" size="sm">{totalMsgCount} msgs</Badge>
                <span className="scene-meta-subtext">({userMsgCount} You · {aiMsgCount} AI)</span>
              </div>
            </div>

            <div className="scene-meta-item">
              <span className="meta-label"><Icon name="Users" size={13} /> In Scene</span>
              <Badge variant="neutral" size="sm">{activeCount} active</Badge>
            </div>
          </div>
        </article>

        <section className="scene-section">
          <h3 className="section-subtitle flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="Globe" size={15} /> World State
              <Badge variant="neutral" size="xs" pill>{worldState.length}</Badge>
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => { setIsAdding(true); setAddName(""); setAddDescription(""); }}
              disabled={actionLoading}
              leftIcon={<Icon name="Plus" size={12} />}
            >
              Add
            </Button>
          </h3>
          {worldState.length > 0 ? (
            <div className="quests-container">
              {worldState.map((ws) => (
                <div key={ws.id} className="quest-card">
                  <div className="quest-card-header">
                    <strong className="quest-title">{ws.name}</strong>
                  </div>

                  {ws.description ? <p className="quest-summary">{ws.description}</p> : null}

                  <div className="quest-card-actions">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={actionLoading}
                      onClick={() => setEditing({ id: ws.id, name: ws.name, description: ws.description })}
                      leftIcon={<Icon name="Pencil" size={12} />}
                      title="Edit state"
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-danger hover:bg-danger-subtle"
                      disabled={actionLoading}
                      onClick={() => setDeleting({ id: ws.id, name: ws.name })}
                      leftIcon={<Icon name="Trash2" size={12} />}
                      title="Delete state"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="info-empty-state">
              <Icon name="Globe" size={15} />
              <span>No notable world states</span>
            </div>
          )}
        </section>
      </div>

      {editing ? (
        <ConfirmModal
          title="Edit World State"
          confirmLabel="Save Changes"
          confirmDisabled={!editing.name.trim()}
          isLoading={actionLoading}
          onConfirm={handleEditSave}
          onCancel={() => setEditing(null)}
          maxWidth={460}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Name / Status"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              disabled={actionLoading}
              autoFocus
            />
            <TextArea
              label="Description"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={3}
              disabled={actionLoading}
            />
          </div>
        </ConfirmModal>
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Delete World State?"
          message={<>This will permanently remove <strong>{deleting.name}</strong> from your active world state.</>}
          confirmLabel="Yes, delete"
          danger
          isLoading={actionLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}

      {isAdding ? (
        <ConfirmModal
          title="Add World State"
          confirmLabel="Add State"
          confirmDisabled={!addName.trim()}
          isLoading={actionLoading}
          onConfirm={handleAddSave}
          onCancel={() => setIsAdding(false)}
          maxWidth={460}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Name / Status"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              disabled={actionLoading}
              autoFocus
              placeholder="E.g. Festival Preparing, Dragon Slain"
            />
            <TextArea
              label="Description (Optional)"
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
              rows={3}
              disabled={actionLoading}
              placeholder="What this means for the world..."
            />
          </div>
        </ConfirmModal>
      ) : null}
    </aside>
  );
}
