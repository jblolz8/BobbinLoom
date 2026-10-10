import { useState } from "react";
import type { InventoryRef, Item, Playthrough } from "../../../../../schemas";
import { ITEMS } from "../../../../../engine/demoData";
import { AvatarBadge, Badge, Button, Icon, TextInput } from "../../../base";
import { ConfirmModal } from "../../../common/ConfirmModal";
import { editPlayer } from "../../../../api";

function getItemDef(ref: InventoryRef, catalog: Item[] | undefined): { name: string; type: string; description?: string } {
  const def = catalog?.find((i) => i.id === ref.itemId) ?? ITEMS.find((i) => i.id === ref.itemId);
  return {
    name: def?.name ?? ref.itemId,
    type: def?.type ?? "misc",
    description: def?.description,
  };
}

function getItemIconName(type: string): string {
  switch (type.toLowerCase()) {
    case "consumable":
      return "FlaskConical";
    case "equipment":
    case "weapon":
      return "Sword";
    case "armor":
      return "Shield";
    case "key":
    case "key item":
      return "Key";
    case "tool":
      return "Wrench";
    default:
      return "Package";
  }
}

export function PlayerTab({
  playthrough,
  onPlaythroughChange
}: {
  playthrough: Playthrough;
  onPlaythroughChange?: (updated: Playthrough) => void;
}) {
  const pc = playthrough.playerCharacter;
  const inventoryCount = playthrough.inventory.reduce((sum, item) => sum + item.quantity, 0);

  const [editingCondition, setEditingCondition] = useState<{ index: number; value: string } | null>(null);
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [newConditionValue, setNewConditionValue] = useState("");

  const [editingFlag, setEditingFlag] = useState<{ index: number; value: string } | null>(null);
  const [isAddingFlag, setIsAddingFlag] = useState(false);
  const [newFlagValue, setNewFlagValue] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  async function handleRemoveCondition(index: number) {
    if (!onPlaythroughChange) return;
    const updatedConditions = pc.conditions.filter((_, i) => i !== index);
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { conditions: updatedConditions });
      onPlaythroughChange(updated);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveEditCondition() {
    if (!onPlaythroughChange || !editingCondition || !editingCondition.value.trim()) return;
    const updatedConditions = [...pc.conditions];
    updatedConditions[editingCondition.index] = editingCondition.value.trim();
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { conditions: updatedConditions });
      onPlaythroughChange(updated);
      setEditingCondition(null);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddCondition() {
    if (!onPlaythroughChange || !newConditionValue.trim()) return;
    const updatedConditions = [...pc.conditions, newConditionValue.trim()];
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { conditions: updatedConditions });
      onPlaythroughChange(updated);
      setIsAddingCondition(false);
      setNewConditionValue("");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveFlag(index: number) {
    if (!onPlaythroughChange) return;
    const currentFlags = pc.flags ?? [];
    const updatedFlags = currentFlags.filter((_, i) => i !== index);
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { flags: updatedFlags });
      onPlaythroughChange(updated);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveEditFlag() {
    if (!onPlaythroughChange || !editingFlag || !editingFlag.value.trim()) return;
    const currentFlags = [...(pc.flags ?? [])];
    currentFlags[editingFlag.index] = editingFlag.value.trim();
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { flags: currentFlags });
      onPlaythroughChange(updated);
      setEditingFlag(null);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddFlag() {
    if (!onPlaythroughChange || !newFlagValue.trim()) return;
    const currentFlags = pc.flags ?? [];
    const updatedFlags = [...currentFlags, newFlagValue.trim()];
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, { flags: updatedFlags });
      onPlaythroughChange(updated);
      setIsAddingFlag(false);
      setNewFlagValue("");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="player-tab-container">
      <article className="card player-overview-card">
        <div className="player-card-header">
          <AvatarBadge name={pc.name} icon="User" size="md" />
          <div>
            <h3 className="player-name">{pc.name}</h3>
            {pc.description ? <p className="player-desc">{pc.description}</p> : null}
          </div>
        </div>

        {pc.bodyType || pc.appearance ? (
          <div className="player-meta-grid">
            {pc.bodyType ? (
              <div className="player-meta-item">
                <span className="meta-label"><Icon name="Activity" size={12} /> Body</span>
                <span className="meta-val">{pc.bodyType}</span>
              </div>
            ) : null}
            {pc.appearance ? (
              <div className="player-meta-item">
                <span className="meta-label"><Icon name="Eye" size={12} /> Appearance</span>
                <span className="meta-val">{pc.appearance}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {pc.clothing.length > 0 ? (
          <div className="player-clothing-section">
            <h4 className="subcard-title flex items-center gap-1">
              <Icon name="Shirt" size={13} /> Clothing
            </h4>
            <div className="clothing-chip-grid">
              {pc.clothing.map((c, i) => (
                <div key={i} className="clothing-chip">
                  <span className="clothing-slot">{c.slot}:</span>
                  <span className="clothing-name">{c.name}</span>
                  {c.state ? <span className="clothing-state">({c.state})</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      {/* Player Conditions */}
      <section className="player-section">
        <h3 className="section-subtitle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="Zap" size={15} /> Conditions
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" size="xs" pill>{pc.conditions.length}</Badge>
            {onPlaythroughChange ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { setIsAddingCondition(true); setNewConditionValue(""); }}
                disabled={actionLoading}
                leftIcon={<Icon name="Plus" size={12} />}
              >
                Add
              </Button>
            ) : null}
          </div>
        </h3>
        {pc.conditions.length > 0 ? (
          <div className="conditions-grid">
            {pc.conditions.map((c, i) => (
              <div key={i} className="condition-chip group flex items-center justify-between">
                <div
                  className="flex items-center gap-1.5 min-w-0 cursor-pointer flex-1"
                  onClick={() => onPlaythroughChange && setEditingCondition({ index: i, value: c })}
                  title={onPlaythroughChange ? "Click to edit condition" : undefined}
                >
                  <Icon name="Activity" size={14} className="condition-icon shrink-0" />
                  <span className="condition-text truncate">{c}</span>
                </div>
                {onPlaythroughChange ? (
                  <button
                    type="button"
                    className="chip-remove-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemoveCondition(i); }}
                    disabled={actionLoading}
                    title="Remove condition"
                    aria-label={`Remove condition ${c}`}
                  >
                    <Icon name="X" size={11} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="info-empty-state">
            <Icon name="ShieldCheck" size={15} />
            <span>No active conditions</span>
          </div>
        )}
      </section>

      {/* Player Flags */}
      <section className="player-section">
        <h3 className="section-subtitle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="Bookmark" size={15} /> Player Flags
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="neutral" size="xs" pill>{(pc.flags ?? []).length}</Badge>
            {onPlaythroughChange ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { setIsAddingFlag(true); setNewFlagValue(""); }}
                disabled={actionLoading}
                leftIcon={<Icon name="Plus" size={12} />}
              >
                Add
              </Button>
            ) : null}
          </div>
        </h3>
        {(pc.flags ?? []).length > 0 ? (
          <div className="flags-chip-grid">
            {(pc.flags ?? []).map((f, i) => (
              <div key={i} className="flag-chip group flex items-center justify-between">
                <div
                  className="flex items-center gap-1.5 min-w-0 cursor-pointer flex-1"
                  onClick={() => onPlaythroughChange && setEditingFlag({ index: i, value: f })}
                  title={onPlaythroughChange ? "Click to edit flag" : undefined}
                >
                  <Icon name="Bookmark" size={11} className="flag-icon shrink-0" />
                  <span className="flag-text truncate">{f}</span>
                </div>
                {onPlaythroughChange ? (
                  <button
                    type="button"
                    className="chip-remove-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFlag(i); }}
                    disabled={actionLoading}
                    title="Remove flag"
                    aria-label={`Remove flag ${f}`}
                  >
                    <Icon name="X" size={10} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="info-empty-state">
            <Icon name="BookmarkCheck" size={15} />
            <span>No active player flags</span>
          </div>
        )}
      </section>

      {/* Inventory */}
      <section className="player-section">
        <h3 className="section-subtitle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="Package" size={15} /> Inventory
          </span>
          <Badge variant="neutral" size="xs" pill>{inventoryCount}</Badge>
        </h3>
        {playthrough.inventory.length > 0 ? (
          <div className="inventory-grid">
            {playthrough.inventory.map((item) => {
              const def = getItemDef(item, playthrough.itemCatalog);
              const iconName = getItemIconName(def.type);
              return (
                <div key={item.itemId} className="inventory-card">
                  <div className="inventory-card-top">
                    <div className="inventory-card-title flex items-center gap-1.5">
                      <span className="inventory-type-icon">
                        <Icon name={iconName} size={14} />
                      </span>
                      <strong className="item-name">{def.name}</strong>
                    </div>
                    <Badge variant="accent" size="xs">x{item.quantity}</Badge>
                  </div>
                  <div className="inventory-card-meta">
                    <Badge variant="outline" size="xs">{def.type}</Badge>
                  </div>
                  {def.description ? (
                    <p className="item-desc">{def.description}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="info-empty-state">
            <Icon name="PackageOpen" size={16} />
            <span>Inventory is empty</span>
          </div>
        )}
      </section>

      {/* Condition Modals */}
      {isAddingCondition ? (
        <ConfirmModal
          title="Add Player Condition"
          confirmLabel="Add Condition"
          confirmDisabled={!newConditionValue.trim()}
          isLoading={actionLoading}
          onConfirm={handleAddCondition}
          onCancel={() => setIsAddingCondition(false)}
          maxWidth={420}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Condition"
              placeholder="e.g. 🤕 Sprained Ankle, 😴 Exhausted"
              value={newConditionValue}
              onChange={(e) => setNewConditionValue(e.target.value)}
              disabled={actionLoading}
              autoFocus
            />
          </div>
        </ConfirmModal>
      ) : null}

      {editingCondition ? (
        <ConfirmModal
          title="Edit Player Condition"
          confirmLabel="Save Changes"
          confirmDisabled={!editingCondition.value.trim()}
          isLoading={actionLoading}
          onConfirm={handleSaveEditCondition}
          onCancel={() => setEditingCondition(null)}
          maxWidth={420}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Condition"
              value={editingCondition.value}
              onChange={(e) => setEditingCondition({ ...editingCondition, value: e.target.value })}
              disabled={actionLoading}
              autoFocus
            />
          </div>
        </ConfirmModal>
      ) : null}

      {/* Flag Modals */}
      {isAddingFlag ? (
        <ConfirmModal
          title="Add Player Flag"
          confirmLabel="Add Flag"
          confirmDisabled={!newFlagValue.trim()}
          isLoading={actionLoading}
          onConfirm={handleAddFlag}
          onCancel={() => setIsAddingFlag(false)}
          maxWidth={420}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Player Flag"
              placeholder="e.g. 🗝️ Knows the Password"
              value={newFlagValue}
              onChange={(e) => setNewFlagValue(e.target.value)}
              disabled={actionLoading}
              autoFocus
            />
          </div>
        </ConfirmModal>
      ) : null}

      {editingFlag ? (
        <ConfirmModal
          title="Edit Player Flag"
          confirmLabel="Save Changes"
          confirmDisabled={!editingFlag.value.trim()}
          isLoading={actionLoading}
          onConfirm={handleSaveEditFlag}
          onCancel={() => setEditingFlag(null)}
          maxWidth={420}
        >
          <div className="modal-form-fields">
            <TextInput
              label="Player Flag"
              value={editingFlag.value}
              onChange={(e) => setEditingFlag({ ...editingFlag, value: e.target.value })}
              disabled={actionLoading}
              autoFocus
            />
          </div>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
