import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { sortPlaythroughTags } from "../../../../engine/playthroughTagTaxonomy";
import type { Playthrough } from "../../../../schemas";
import {
  listPlaythroughs,
  suggestPlaythroughTags,
  updatePlaythroughTags,
  type WorldStateAction,
} from "../../../api";
import {
  AvatarBadge,
  Badge,
  Button,
  Card,
  Icon,
  Separator,
  Stack,
  StatusMessage,
  TagChip,
  Text,
  TextArea,
  TextInput,
} from "../../base";
import { ConfirmModal, EditTagsModal } from "../../common";

export type ScenePanelProps = {
  playthrough: Playthrough;
  onPlaythroughChange?: (updated: Playthrough) => void;
  actionLoading: boolean;
  onWorldStateAction: (
    wsId: string,
    action: WorldStateAction,
    name?: string,
    description?: string,
  ) => void;
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

export function ScenePanel({
  playthrough,
  onPlaythroughChange,
  actionLoading,
  onWorldStateAction,
  className,
  style,
}: ScenePanelProps) {
  const [editing, setEditing] = useState<EditState>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [deleting, setDeleting] = useState<DeleteConfirm>(null);

  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [libraryTags, setLibraryTags] = useState<string[]>([]);

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

  function handleOpenEditTags() {
    setTagsError(null);
    setTagsModalOpen(true);
    void listPlaythroughs({ page: 1, pageSize: 1 })
      .then((res) => {
        if (res.tagCounts) {
          setLibraryTags(res.tagCounts.map((t) => t.tag));
        }
      })
      .catch(() => {
        /* fallback to current playthrough tags if listing fails */
      });
  }

  async function handleSaveTags(nextTags: string[]) {
    setTagsSaving(true);
    setTagsError(null);
    try {
      const updated = await updatePlaythroughTags(playthrough.id, nextTags);
      const normalized = sortPlaythroughTags(updated.tags ?? nextTags);
      onPlaythroughChange?.({ ...updated, tags: normalized });
      setTagsModalOpen(false);
    } catch (e) {
      setTagsError(e instanceof Error ? e.message : String(e));
    } finally {
      setTagsSaving(false);
    }
  }

  const tags = useMemo(
    () => sortPlaythroughTags(playthrough.tags ?? []),
    [playthrough.tags],
  );
  const effectiveLibraryTags = useMemo(() => {
    const merged = new Set<string>([...libraryTags, ...tags]);
    return [...merged];
  }, [libraryTags, tags]);

  const worldState = playthrough.worldState || [];
  const activeCount = (playthrough.activeCharacters ?? []).length;
  const storyMessages = (playthrough.messages ?? []).filter(
    (m) => !m.hidden || m.chapterId,
  );
  const userMsgCount = storyMessages.filter((m) => m.role === "user").length;
  const aiMsgCount = storyMessages.filter((m) => m.role === "assistant").length;
  const totalMsgCount = storyMessages.length;

  return (
    <aside
      className={`panel left-panel${className ? ` ${className}` : ""}`}
      style={style}
    >
      <Stack direction="column" align="stretch" gap="md" fullWidth>
        <Card
          as="article"
          variant="elevated"
          padding="md"
          layout="column"
          fullWidth
        >
          <Stack direction="row" align="center" gap="sm" fullWidth>
            <AvatarBadge icon="Compass" size="md" shape="circle" />
            <Stack direction="column" align="start" gap="2xs">
              <Text as="h3" variant="title" size="md" weight="semibold">
                Scene Overview
              </Text>
              <Text variant="caption" size="xs" tone="muted">
                Current environment status
              </Text>
            </Stack>
          </Stack>

          <Separator spacing="none" />

          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              fullWidth
            >
              <Stack direction="row" align="center" gap="2xs">
                <Icon name="Clock" size={13} />
                <Text variant="caption" size="xs" tone="muted">
                  Turn
                </Text>
              </Stack>
              <Badge variant="accent" size="sm">
                #{playthrough.turn}
              </Badge>
            </Stack>

            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              fullWidth
            >
              <Stack direction="row" align="center" gap="2xs">
                <Icon name="MessageSquare" size={13} />
                <Text variant="caption" size="xs" tone="muted">
                  Messages
                </Text>
              </Stack>
              <Stack
                direction="row"
                align="center"
                justify="end"
                gap="2xs"
                wrap
              >
                <Badge variant="neutral" size="sm">
                  {totalMsgCount} msgs
                </Badge>
                <Text variant="caption" size="2xs" tone="muted" nowrap>
                  ({userMsgCount} You · {aiMsgCount} AI)
                </Text>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              fullWidth
            >
              <Stack direction="row" align="center" gap="2xs">
                <Icon name="Users" size={13} />
                <Text variant="caption" size="xs" tone="muted">
                  In Scene
                </Text>
              </Stack>
              <Badge variant="neutral" size="sm">
                {activeCount} active
              </Badge>
            </Stack>
          </Stack>
        </Card>

        <Stack
          as="section"
          direction="column"
          align="stretch"
          gap="xs"
          fullWidth
        >
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            fullWidth
          >
            <Stack direction="row" align="center" gap="xs">
              <Icon name="Tags" size={15} />
              <Text
                as="h3"
                variant="label"
                size="xs"
                weight="semibold"
                tone="secondary"
                uppercase
              >
                Story Tags
              </Text>
              <Badge variant="neutral" size="xs" pill>
                {tags.length}
              </Badge>
            </Stack>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleOpenEditTags}
              disabled={actionLoading}
              leftIcon={
                <Icon name={tags.length > 0 ? "Pencil" : "Plus"} size={12} />
              }
            >
              {tags.length > 0 ? "Edit" : "Add"}
            </Button>
          </Stack>

          {tags.length > 0 ? (
            <Card variant="elevated" padding="sm" fullWidth>
              <Stack direction="row" align="center" gap="xs" wrap fullWidth>
                {tags.map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    taxonomy="playthrough"
                    size="sm"
                  />
                ))}
              </Stack>
            </Card>
          ) : (
            <StatusMessage variant="inline" tone="neutral" icon="Tags">
              No story tags assigned yet
            </StatusMessage>
          )}
        </Stack>

        <Stack
          as="section"
          direction="column"
          align="stretch"
          gap="xs"
          fullWidth
        >
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            fullWidth
          >
            <Stack direction="row" align="center" gap="xs">
              <Icon name="Globe" size={15} />
              <Text
                as="h3"
                variant="label"
                size="xs"
                weight="semibold"
                tone="secondary"
                uppercase
              >
                World State
              </Text>
              <Badge variant="neutral" size="xs" pill>
                {worldState.length}
              </Badge>
            </Stack>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsAdding(true);
                setAddName("");
                setAddDescription("");
              }}
              disabled={actionLoading}
              leftIcon={<Icon name="Plus" size={12} />}
            >
              Add
            </Button>
          </Stack>

          {worldState.length > 0 ? (
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              {worldState.map((ws) => (
                <Card
                  key={ws.id}
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
                    <Text as="strong" size="sm" weight="semibold" truncate>
                      {ws.name}
                    </Text>
                  </Stack>

                  {ws.description ? (
                    <Text
                      variant="body"
                      size="xs"
                      tone="secondary"
                      leading="snug"
                    >
                      {ws.description}
                    </Text>
                  ) : null}

                  <Separator spacing="none" />

                  <Stack
                    direction="row"
                    align="center"
                    justify="end"
                    gap="xs"
                    fullWidth
                  >
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={actionLoading}
                      onClick={() =>
                        setEditing({
                          id: ws.id,
                          name: ws.name,
                          description: ws.description,
                        })
                      }
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
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : (
            <StatusMessage variant="inline" tone="neutral" icon="Globe">
              No notable world states
            </StatusMessage>
          )}
        </Stack>
      </Stack>

      {tagsModalOpen ? (
        <EditTagsModal
          entityName={playthrough.name}
          taxonomy="playthrough"
          initialTags={tags}
          libraryTags={effectiveLibraryTags}
          busy={tagsSaving}
          error={tagsError}
          contextOptions={[
            {
              id: "worldState",
              icon: "Globe",
              title: "World State & Premise",
              description: "Scenario setup and active world state entries.",
              defaultChecked: true,
            },
            {
              id: "castAndPersona",
              icon: "Users",
              title: "Player Persona & Cast",
              description: "Player details, main cast sheets, and NPCs.",
              defaultChecked: true,
            },
            {
              id: "chaptersAndTimeline",
              icon: "BookOpen",
              title: "Chapters & Event Timeline",
              description: "Archived chapter summaries and memory events.",
              defaultChecked: true,
            },
            {
              id: "currentChapterMessages",
              icon: "MessageSquare",
              title: "Current Chapter Chat History",
              description: "Visible messages from the active chapter.",
              defaultChecked: true,
            },
          ]}
          onSuggestAiTags={async ({
            providerId,
            currentTags,
            guidance,
            selectedContext,
            signal,
          }) => {
            const res = await suggestPlaythroughTags(
              playthrough.id,
              {
                providerId,
                currentTags,
                libraryTags: effectiveLibraryTags,
                guidance,
                includeWorldState: selectedContext.worldState ?? true,
                includeCastAndPersona: selectedContext.castAndPersona ?? true,
                includeChaptersAndTimeline:
                  selectedContext.chaptersAndTimeline ?? true,
                includeCurrentChapterMessages:
                  selectedContext.currentChapterMessages ?? true,
              },
              signal,
            );
            return res.tags;
          }}
          onSave={(nextTags) => {
            void handleSaveTags(nextTags);
          }}
          onClose={() => {
            if (!tagsSaving) {
              setTagsModalOpen(false);
              setTagsError(null);
            }
          }}
        />
      ) : null}

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
          <Stack
            direction="column"
            align="stretch"
            gap="sm"
            fullWidth
            className="modal-form-fields"
          >
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
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
              rows={3}
              disabled={actionLoading}
            />
          </Stack>
        </ConfirmModal>
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Delete World State?"
          message={
            <>
              This will permanently remove <strong>{deleting.name}</strong> from
              your active world state.
            </>
          }
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
          <Stack
            direction="column"
            align="stretch"
            gap="sm"
            fullWidth
            className="modal-form-fields"
          >
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
          </Stack>
        </ConfirmModal>
      ) : null}
    </aside>
  );
}
