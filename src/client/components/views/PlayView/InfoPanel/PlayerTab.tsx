import { useState } from "react";
import type { InventoryRef, Item, Playthrough } from "../../../../../schemas";
import { ITEMS } from "../../../../../engine/demoData";
import {
  AvatarBadge,
  Badge,
  Button,
  Card,
  Icon,
  Separator,
  Stack,
  StatusMessage,
  Text,
  TextInput,
  type IconName,
} from "../../../base";
import { ConfirmModal } from "../../../common";
import { editPlayer, getPersonaAvatarUrl } from "../../../../api";

function getItemDef(
  ref: InventoryRef,
  catalog: Item[] | undefined,
): { name: string; type: string; description?: string } {
  const def =
    catalog?.find((i) => i.id === ref.itemId) ??
    ITEMS.find((i) => i.id === ref.itemId);
  return {
    name: def?.name ?? ref.itemId,
    type: def?.type ?? "misc",
    description: def?.description,
  };
}

function getItemIconName(type: string): IconName {
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
  onPlaythroughChange,
}: {
  playthrough: Playthrough;
  onPlaythroughChange?: (updated: Playthrough) => void;
}) {
  const pc = playthrough.playerCharacter;
  const inventoryCount = playthrough.inventory.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const [editingCondition, setEditingCondition] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [newConditionValue, setNewConditionValue] = useState("");

  const [editingFlag, setEditingFlag] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const [isAddingFlag, setIsAddingFlag] = useState(false);
  const [newFlagValue, setNewFlagValue] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  async function handleRemoveCondition(index: number) {
    if (!onPlaythroughChange) return;
    const updatedConditions = pc.conditions.filter((_, i) => i !== index);
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, {
        conditions: updatedConditions,
      });
      onPlaythroughChange(updated);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveEditCondition() {
    if (
      !onPlaythroughChange ||
      !editingCondition ||
      !editingCondition.value.trim()
    )
      return;
    const updatedConditions = [...pc.conditions];
    updatedConditions[editingCondition.index] = editingCondition.value.trim();
    setActionLoading(true);
    try {
      const updated = await editPlayer(playthrough.id, {
        conditions: updatedConditions,
      });
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
      const updated = await editPlayer(playthrough.id, {
        conditions: updatedConditions,
      });
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
    if (!onPlaythroughChange || !editingFlag || !editingFlag.value.trim())
      return;
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

  const flags = pc.flags ?? [];

  const parseAttributeItems = (
    raw?: string,
  ): Array<{ key?: string; value: string }> => {
    if (!raw) return [];
    return raw
      .split(/\r?\n|\s+(?=-\s*[A-Za-z])/)
      .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
      .filter((line) => line.length > 0 && !/^\(\s*not established\s*\)$/i.test(line))
      .map((line) => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        return match
          ? { key: match[1].trim(), value: match[2].trim() }
          : { value: line };
      });
  };

  const bodyItems = parseAttributeItems(pc.bodyType);
  const appearanceItems = parseAttributeItems(pc.appearance);

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* Player Overview Card */}
      <Card
        as="article"
        variant="elevated"
        padding="md"
        layout="column"
        fullWidth
      >
        <Stack direction="row" align="start" gap="sm" fullWidth>
          <AvatarBadge
            src={getPersonaAvatarUrl(
              playthrough.personaId ?? "persona_default",
              "profile",
            )}
            name={pc.name}
            icon="User"
            size="md"
          />
          <Stack direction="column" align="start" gap="2xs" flex1>
            <Text as="h3" variant="title" size="md" weight="semibold">
              {pc.name}
            </Text>
            {pc.description ? (
              <Text variant="body" size="xs" tone="secondary" leading="snug">
                {pc.description}
              </Text>
            ) : null}
          </Stack>
        </Stack>

        {bodyItems.length > 0 || appearanceItems.length > 0 ? (
          <>
            <Separator spacing="none" />
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              {bodyItems.length > 0 ? (
                <Stack direction="column" align="stretch" gap="xs" fullWidth>
                  <Stack direction="row" align="center" gap="2xs">
                    <Icon name="Activity" size={13} />
                    <Text
                      as="h4"
                      variant="label"
                      size="xs"
                      weight="semibold"
                      tone="secondary"
                      uppercase
                    >
                      Body
                    </Text>
                  </Stack>
                  <Stack direction="row" align="center" gap="xs" wrap fullWidth>
                    {bodyItems.map((item, i) => (
                      <Badge key={i} variant="outline" size="sm">
                        {item.key ? (
                          <Text
                            as="span"
                            size="xs"
                            tone="muted"
                            weight="medium"
                          >
                            {item.key}:
                          </Text>
                        ) : null}
                        <Text as="span" size="xs" weight="medium">
                          {item.value}
                        </Text>
                      </Badge>
                    ))}
                  </Stack>
                </Stack>
              ) : null}
              {appearanceItems.length > 0 ? (
                <Stack direction="column" align="stretch" gap="xs" fullWidth>
                  <Stack direction="row" align="center" gap="2xs">
                    <Icon name="Eye" size={13} />
                    <Text
                      as="h4"
                      variant="label"
                      size="xs"
                      weight="semibold"
                      tone="secondary"
                      uppercase
                    >
                      Appearance
                    </Text>
                  </Stack>
                  <Stack direction="row" align="center" gap="xs" wrap fullWidth>
                    {appearanceItems.map((item, i) => (
                      <Badge key={i} variant="outline" size="sm">
                        {item.key ? (
                          <Text
                            as="span"
                            size="xs"
                            tone="muted"
                            weight="medium"
                          >
                            {item.key}:
                          </Text>
                        ) : null}
                        <Text as="span" size="xs" weight="medium">
                          {item.value}
                        </Text>
                      </Badge>
                    ))}
                  </Stack>
                </Stack>
              ) : null}
            </Stack>
          </>
        ) : null}

        {pc.clothing.length > 0 ? (
          <>
            <Separator spacing="none" />
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack direction="row" align="center" gap="2xs">
                <Icon name="Shirt" size={13} />
                <Text
                  as="h4"
                  variant="label"
                  size="xs"
                  weight="semibold"
                  tone="secondary"
                  uppercase
                >
                  Clothing
                </Text>
              </Stack>
              <Stack direction="row" align="center" gap="xs" wrap fullWidth>
                {pc.clothing.map((c, i) => (
                  <Badge key={i} variant="outline" size="sm">
                    <Text as="span" size="xs" tone="muted" weight="medium">
                      {c.slot}:
                    </Text>
                    <Text as="span" size="xs" weight="medium">
                      {c.name}
                    </Text>
                    {c.state ? (
                      <Text as="span" size="xs" tone="secondary" italic>
                        ({c.state})
                      </Text>
                    ) : null}
                  </Badge>
                ))}
              </Stack>
            </Stack>
          </>
        ) : null}
      </Card>

      {/* Player Conditions */}
      <Stack as="section" direction="column" align="stretch" gap="xs" fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Zap" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Conditions
            </Text>
            <Badge variant="neutral" size="xs" pill>
              {pc.conditions.length}
            </Badge>
          </Stack>
          {onPlaythroughChange ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsAddingCondition(true);
                setNewConditionValue("");
              }}
              disabled={actionLoading}
              leftIcon={<Icon name="Plus" size={12} />}
            >
              Add
            </Button>
          ) : null}
        </Stack>

        {pc.conditions.length > 0 ? (
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            {pc.conditions.map((c, i) => (
              <Card
                key={i}
                variant="panel"
                padding="xs"
                hoverable={Boolean(onPlaythroughChange)}
                fullWidth
                onClick={() =>
                  onPlaythroughChange &&
                  setEditingCondition({ index: i, value: c })
                }
                title={
                  onPlaythroughChange ? "Click to edit condition" : undefined
                }
              >
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                  fullWidth
                >
                  <Stack direction="row" align="center" gap="xs" flex1>
                    <Text size="xs" weight="medium" truncate>
                      {c}
                    </Text>
                  </Stack>
                  {onPlaythroughChange ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      leftIcon="X"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveCondition(i);
                      }}
                      disabled={actionLoading}
                      title="Remove condition"
                      aria-label={`Remove condition ${c}`}
                    />
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <StatusMessage variant="inline" tone="neutral" icon="ShieldCheck">
            No active conditions
          </StatusMessage>
        )}
      </Stack>

      {/* Player Flags */}
      <Stack as="section" direction="column" align="stretch" gap="xs" fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Bookmark" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Player Flags
            </Text>
            <Badge variant="neutral" size="xs" pill>
              {flags.length}
            </Badge>
          </Stack>
          {onPlaythroughChange ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsAddingFlag(true);
                setNewFlagValue("");
              }}
              disabled={actionLoading}
              leftIcon={<Icon name="Plus" size={12} />}
            >
              Add
            </Button>
          ) : null}
        </Stack>

        {flags.length > 0 ? (
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            {flags.map((f, i) => (
              <Card
                key={i}
                variant="panel"
                padding="xs"
                hoverable={Boolean(onPlaythroughChange)}
                fullWidth
                onClick={() =>
                  onPlaythroughChange && setEditingFlag({ index: i, value: f })
                }
                title={onPlaythroughChange ? "Click to edit flag" : undefined}
              >
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                  fullWidth
                >
                  <Stack direction="row" align="center" gap="xs" flex1>
                    <Text size="xs" weight="medium" truncate>
                      {f}
                    </Text>
                  </Stack>
                  {onPlaythroughChange ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      leftIcon="X"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemoveFlag(i);
                      }}
                      disabled={actionLoading}
                      title="Remove flag"
                      aria-label={`Remove flag ${f}`}
                    />
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <StatusMessage variant="inline" tone="neutral" icon="BookmarkCheck">
            No active player flags
          </StatusMessage>
        )}
      </Stack>

      {/* Inventory */}
      <Stack as="section" direction="column" align="stretch" gap="xs" fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Stack direction="row" align="center" gap="xs">
            <Icon name="Package" size={15} />
            <Text
              as="h3"
              variant="label"
              size="xs"
              weight="semibold"
              tone="secondary"
              uppercase
            >
              Inventory
            </Text>
          </Stack>
          <Badge variant="neutral" size="xs" pill>
            {inventoryCount}
          </Badge>
        </Stack>

        {playthrough.inventory.length > 0 ? (
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            {playthrough.inventory.map((item) => {
              const def = getItemDef(item, playthrough.itemCatalog);
              const iconName = getItemIconName(def.type);
              return (
                <Card
                  key={item.itemId}
                  variant="elevated"
                  padding="sm"
                  layout="column"
                  fullWidth
                >
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" flex1>
                      <AvatarBadge icon={iconName} size="xs" />
                      <Text as="strong" size="sm" weight="semibold" truncate>
                        {def.name}
                      </Text>
                    </Stack>
                    <Stack direction="row" align="center" gap="2xs">
                      <Badge variant="outline" size="xs">
                        {def.type}
                      </Badge>
                      <Badge variant="accent" size="xs">
                        x{item.quantity}
                      </Badge>
                    </Stack>
                  </Stack>
                  {def.description ? (
                    <Text
                      variant="body"
                      size="xs"
                      tone="secondary"
                      leading="snug"
                    >
                      {def.description}
                    </Text>
                  ) : null}
                </Card>
              );
            })}
          </Stack>
        ) : (
          <StatusMessage variant="inline" tone="neutral" icon="PackageOpen">
            Inventory is empty
          </StatusMessage>
        )}
      </Stack>

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
          <Stack direction="column" gap="sm" fullWidth>
            <TextInput
              label="Condition"
              placeholder="e.g. 🤕 Sprained Ankle, 😴 Exhausted"
              value={newConditionValue}
              onChange={(e) => setNewConditionValue(e.target.value)}
              disabled={actionLoading}
              autoFocus
            />
          </Stack>
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
          <Stack direction="column" gap="sm" fullWidth>
            <TextInput
              label="Condition"
              value={editingCondition.value}
              onChange={(e) =>
                setEditingCondition({
                  ...editingCondition,
                  value: e.target.value,
                })
              }
              disabled={actionLoading}
              autoFocus
            />
          </Stack>
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
          <Stack direction="column" gap="sm" fullWidth>
            <TextInput
              label="Player Flag"
              placeholder="e.g. 🗝️ Knows the Password"
              value={newFlagValue}
              onChange={(e) => setNewFlagValue(e.target.value)}
              disabled={actionLoading}
              autoFocus
            />
          </Stack>
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
          <Stack direction="column" gap="sm" fullWidth>
            <TextInput
              label="Player Flag"
              value={editingFlag.value}
              onChange={(e) =>
                setEditingFlag({ ...editingFlag, value: e.target.value })
              }
              disabled={actionLoading}
              autoFocus
            />
          </Stack>
        </ConfirmModal>
      ) : null}
    </Stack>
  );
}
