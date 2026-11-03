import { useCallback, useEffect, useMemo, useState } from "react";
import type { Playthrough } from "../../../schemas";
import {
  deletePlaythrough,
  listPlaythroughTimelines,
  renamePlaythrough,
} from "../../api";
import {
  Badge,
  Button,
  Card,
  CheckboxRow,
  Header,
  Icon,
  IconButton,
  Modal,
  Stack,
  StatusMessage,
  Text,
} from "../base";
import {
  ConfirmModal,
  HierarchyGraph,
  RenameModal,
  type HierarchyGraphDirection,
  type HierarchyGraphItem,
} from "../common";

export type TimelineModalProps = {
  open: boolean;
  onClose: () => void;
  /** Full playthrough when opened from PlayView. */
  activePlaythrough?: Playthrough;
  /** Target playthrough ID when opened from PlaythroughLibrary shelf. */
  playthroughId?: string;
  /** Display name fallback while loading when opened from PlaythroughLibrary shelf. */
  playthroughName?: string;
  /** Currently active playthrough ID in the app (to badge the active timeline). */
  currentPlaythroughId?: string;
  onSwitchPlaythrough: (id: string) => Promise<void> | void;
  /** Optional callback fired when a timeline is renamed or deleted so the caller can refresh. */
  onTimelinesChanged?: () => void;
};

export function TimelineModal({
  open,
  onClose,
  activePlaythrough,
  playthroughId,
  playthroughName,
  currentPlaythroughId,
  onSwitchPlaythrough,
  onTimelinesChanged,
}: TimelineModalProps) {
  const effectiveTargetId = playthroughId ?? activePlaythrough?.id ?? "";
  const effectiveCurrentId =
    currentPlaythroughId ?? activePlaythrough?.id ?? "";
  const effectiveTargetName =
    playthroughName ?? activePlaythrough?.name ?? "Playthrough";

  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaythrough, setSelectedPlaythrough] =
    useState<Playthrough | null>(null);
  const [direction, setDirection] = useState<HierarchyGraphDirection>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "TB" : "LR",
  );

  const [renameTarget, setRenameTarget] = useState<Playthrough | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Playthrough | null>(null);
  const [deleteAllBranches, setDeleteAllBranches] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const fetchPlaythroughs = useCallback(async () => {
    if (!effectiveTargetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listPlaythroughTimelines(effectiveTargetId);
      setPlaythroughs(res.timelines);
      setSelectedPlaythrough((prev) => {
        if (prev) {
          const found = res.timelines.find((p) => p.id === prev.id);
          if (found) return found;
        }
        return (
          res.timelines.find((p) => p.id === effectiveTargetId) ??
          res.timelines.find((p) => p.id === effectiveCurrentId) ??
          res.timelines[0] ??
          null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [effectiveTargetId, effectiveCurrentId]);

  useEffect(() => {
    if (open && effectiveTargetId) {
      if (activePlaythrough && activePlaythrough.id === effectiveTargetId) {
        setSelectedPlaythrough(activePlaythrough);
      } else {
        setSelectedPlaythrough(null);
      }
      setDeleteTarget(null);
      setDeleteAllBranches(false);
      setRenameTarget(null);
      void fetchPlaythroughs();
    }
  }, [open, effectiveTargetId, activePlaythrough, fetchPlaythroughs]);

  const handleSelectItem = useCallback(
    (item: HierarchyGraphItem<Playthrough>) => {
      setSelectedPlaythrough(item.data);
      setRenameTarget(null);
      setDeleteTarget(null);
    },
    [],
  );

  const handleSwitch = useCallback(
    async (id: string) => {
      await onSwitchPlaythrough(id);
      onClose();
    },
    [onSwitchPlaythrough, onClose],
  );

  const handleRename = useCallback(
    async (name: string) => {
      const target = renameTarget;
      if (!target || !name.trim()) return;
      setRenameSaving(true);
      setRenameError(null);
      try {
        const updated = await renamePlaythrough(target.id, name.trim());
        setPlaythroughs((prev) =>
          prev.map((p) => (p.id === target.id ? updated : p)),
        );
        setSelectedPlaythrough(updated);
        setRenameTarget(null);
        onTimelinesChanged?.();
      } catch (err) {
        setRenameError(err instanceof Error ? err.message : String(err));
      } finally {
        setRenameSaving(false);
      }
    },
    [renameTarget, onTimelinesChanged],
  );

  // Build parent-child relationship map across the loaded family
  const { graphItems, parentByChildId, childrenCountById } = useMemo(() => {
    const branchMap = new Map<string, Playthrough>();
    for (const p of playthroughs) {
      const bId = p.branchId || p.id;
      if (!branchMap.has(bId)) {
        branchMap.set(bId, p);
      }
    }

    const byId = new Map(playthroughs.map((p) => [p.id, p]));
    const parentByChild = new Map<string, Playthrough>();
    const childCount = new Map<string, number>();

    for (const p of playthroughs) {
      let resolvedParent: Playthrough | undefined;
      if (p.parentBranchId) {
        const candidate = branchMap.get(p.parentBranchId);
        if (candidate && candidate.id !== p.id) {
          resolvedParent = candidate;
        }
      }
      if (
        !resolvedParent &&
        p.rootPlaythroughId &&
        p.rootPlaythroughId !== p.id
      ) {
        const rootCandidate = byId.get(p.rootPlaythroughId);
        if (rootCandidate) {
          resolvedParent = rootCandidate;
        }
      }
      if (resolvedParent) {
        parentByChild.set(p.id, resolvedParent);
        childCount.set(
          resolvedParent.id,
          (childCount.get(resolvedParent.id) ?? 0) + 1,
        );
      }
    }

    // Sort playthroughs so roots and earlier fork turns appear cleanly in order
    const sorted = [...playthroughs].sort((a, b) => {
      const aTurn = a.createdFromTurn ?? 0;
      const bTurn = b.createdFromTurn ?? 0;
      if (aTurn !== bTurn) return aTurn - bTurn;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const items: HierarchyGraphItem<Playthrough>[] = sorted.map((p) => {
      const parent = parentByChild.get(p.id);
      const isActive = p.id === effectiveCurrentId;
      const isSelected = selectedPlaythrough?.id === p.id;
      const edgeLabel =
        parent && p.createdFromTurn !== undefined
          ? `Forked at T${p.createdFromTurn}`
          : undefined;

      return {
        id: p.id,
        parentId: parent?.id ?? null,
        edgeLabel,
        isActive,
        isSelected,
        data: p,
      };
    });

    return {
      graphItems: items,
      parentByChildId: parentByChild,
      childrenCountById: childCount,
    };
  }, [playthroughs, effectiveCurrentId, selectedPlaythrough]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteSaving) return;
    setDeleteSaving(true);
    setError(null);
    try {
      await deletePlaythrough(deleteTarget.id, {
        deleteBranches: deleteAllBranches,
      });
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      setDeleteAllBranches(false);
      onTimelinesChanged?.();

      if (deleteAllBranches || playthroughs.length <= 1) {
        onClose();
        return;
      }

      await fetchPlaythroughs();
      if (selectedPlaythrough?.id === deletedId) {
        const remaining = playthroughs.filter((p) => p.id !== deletedId);
        setSelectedPlaythrough(remaining[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteSaving(false);
    }
  }, [
    deleteTarget,
    deleteSaving,
    deleteAllBranches,
    playthroughs,
    selectedPlaythrough,
    fetchPlaythroughs,
    onTimelinesChanged,
    onClose,
  ]);

  const renderTimelineNode = useCallback(
    (item: HierarchyGraphItem<Playthrough>) => {
      const p = item.data;
      const visibleMessages = p.messages.filter((m) => !m.hidden);
      const lastMsg = visibleMessages[visibleMessages.length - 1];
      const isRoot = !item.parentId;
      const chapterCount = (p.chapters?.length ?? 0) + 1;

      return (
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="2xs"
            wrap
            fullWidth
          >
            <Stack direction="row" align="center" gap="2xs" wrap>
              <Badge variant="accent" size="xs" leftIcon="Clock">
                Turn {p.turn}
              </Badge>
              {isRoot ? (
                <Badge variant="outline" size="xs" leftIcon="GitBranch">
                  Root
                </Badge>
              ) : p.createdFromTurn !== undefined ? (
                <Badge variant="neutral" size="xs" leftIcon="GitFork">
                  From T{p.createdFromTurn}
                </Badge>
              ) : null}
            </Stack>
            {item.isActive ? (
              <Badge variant="info" size="xs">
                ACTIVE
              </Badge>
            ) : null}
          </Stack>

          <Text size="sm" weight="semibold" truncate title={p.name}>
            {p.name}
          </Text>

          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            fullWidth
          >
            <Text size="2xs" tone="muted">
              {visibleMessages.length}{" "}
              {visibleMessages.length === 1 ? "msg" : "msgs"} • {chapterCount}{" "}
              {chapterCount === 1 ? "chapter" : "chapters"}
            </Text>
            <Text size="2xs" tone="muted">
              {p.characters.length} cast
            </Text>
          </Stack>

          {lastMsg ? (
            <div
              className="common-hierarchy-node__preview"
              title={lastMsg.content}
            >
              <span className="common-hierarchy-node__preview-role">
                {lastMsg.role === "user" ? "You" : "AI"}:
              </span>{" "}
              {lastMsg.content.slice(0, 58)}
              {lastMsg.content.length > 58 ? "…" : ""}
            </div>
          ) : (
            <div className="common-hierarchy-node__preview">
              No visible messages yet
            </div>
          )}

          <Stack
            direction="row"
            align="center"
            justify="end"
            gap="xs"
            fullWidth
          >
            {item.isActive ? (
              <Badge variant="accent" size="xs">
                Current Timeline
              </Badge>
            ) : (
              <Button
                variant="secondary"
                size="xs"
                leftIcon="Play"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSwitch(p.id);
                }}
              >
                Switch
              </Button>
            )}
          </Stack>
        </Stack>
      );
    },
    [handleSwitch],
  );

  const selectedVisibleMessages = useMemo(() => {
    if (!selectedPlaythrough) return [];
    return selectedPlaythrough.messages.filter((m) => !m.hidden);
  }, [selectedPlaythrough]);

  if (!open) return null;

  const selectedIsActive = selectedPlaythrough?.id === effectiveCurrentId;
  const parentOfSelected = selectedPlaythrough
    ? parentByChildId.get(selectedPlaythrough.id)
    : undefined;
  const selectedVisibleMsgCount = selectedVisibleMessages.length;
  const selectedLastMessage =
    selectedVisibleMessages[selectedVisibleMessages.length - 1] ?? null;
  const selectedChildCount = selectedPlaythrough
    ? (childrenCountById.get(selectedPlaythrough.id) ?? 0)
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      fullScreenMobile
      ariaLabel="Timeline Branches Viewer"
    >
      <Header
        variant="section"
        icon="GitFork"
        title="Timelines & Branches"
        subtitle={`Explore and switch between ${playthroughs.length || 1} timeline ${playthroughs.length === 1 ? "branch" : "branches"} for "${effectiveTargetName}".`}
        actions={
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        }
      />

      <Modal.Body>
        {error ? (
          <StatusMessage
            variant="banner"
            tone="err"
            onDismiss={() => setError(null)}
          >
            {error}
          </StatusMessage>
        ) : null}

        <HierarchyGraph
          items={graphItems}
          renderNode={renderTimelineNode}
          onSelectItem={handleSelectItem}
          direction={direction}
          onDirectionChange={setDirection}
          nodeWidth={256}
          nodeHeight={168}
          size="fill"
          loading={loading}
          loadingLabel="Loading timelines…"
          emptyIcon="GitBranch"
          emptyTitle="No Branches Found"
          emptyDescription="Branch from any message in your chat to create alternative timeline paths!"
          ariaLabel="Playthrough Timeline Tree Graph"
        />

        {selectedPlaythrough ? (
          <Card
            variant="elevated"
            padding="sm"
            fullWidth
            style={{ flexShrink: 0 }}
          >
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="md"
                wrap
                fullWidth
              >
                <Stack
                  direction="column"
                  align="start"
                  gap="2xs"
                  flex1
                  style={{ minWidth: "min(220px, 100%)" }}
                >
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Text size="md" weight="bold">
                      {selectedPlaythrough.name}
                    </Text>
                    <IconButton
                      icon="Pencil"
                      size="xs"
                      variant="ghost"
                      label="Rename timeline"
                      title="Rename timeline"
                      onClick={() => {
                        setRenameError(null);
                        setRenameTarget(selectedPlaythrough);
                      }}
                    />
                    {selectedIsActive ? (
                      <Badge variant="accent" size="xs">
                        CURRENT TIMELINE
                      </Badge>
                    ) : null}
                    {!parentOfSelected ? (
                      <Badge variant="outline" size="xs" leftIcon="GitBranch">
                        Root Lineage
                      </Badge>
                    ) : (
                      <Badge
                        variant="neutral"
                        size="xs"
                        leftIcon="GitFork"
                        style={{ cursor: "pointer" }}
                        title={`Click to select parent timeline "${parentOfSelected.name}"`}
                        onClick={() => setSelectedPlaythrough(parentOfSelected)}
                      >
                        Forked from {parentOfSelected.name}
                        {selectedPlaythrough.createdFromTurn !== undefined
                          ? ` at Turn ${selectedPlaythrough.createdFromTurn}`
                          : ""}
                      </Badge>
                    )}
                    {selectedChildCount > 0 ? (
                      <Badge variant="info" size="xs" leftIcon="GitBranch">
                        {selectedChildCount} child{" "}
                        {selectedChildCount === 1 ? "branch" : "branches"}
                      </Badge>
                    ) : null}
                  </Stack>

                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Text size="xs" tone="secondary">
                      <strong>Turn {selectedPlaythrough.turn}</strong>
                    </Text>
                    <Text size="xs" tone="muted">
                      •
                    </Text>
                    <Text size="xs" tone="secondary">
                      {selectedVisibleMsgCount}{" "}
                      {selectedVisibleMsgCount === 1 ? "message" : "messages"}
                    </Text>
                    <Text size="xs" tone="muted">
                      •
                    </Text>
                    <Text size="xs" tone="secondary">
                      {(selectedPlaythrough.chapters?.length ?? 0) + 1}{" "}
                      {(selectedPlaythrough.chapters?.length ?? 0) + 1 === 1
                        ? "chapter"
                        : "chapters"}
                    </Text>
                    <Text size="xs" tone="muted">
                      •
                    </Text>
                    <Text size="xs" tone="secondary">
                      {selectedPlaythrough.characters.length} cast
                    </Text>
                    <Text size="xs" tone="muted">
                      •
                    </Text>
                    <Text size="xs" tone="muted">
                      Updated{" "}
                      {new Date(
                        selectedPlaythrough.updatedAt,
                      ).toLocaleDateString()}
                    </Text>
                  </Stack>
                </Stack>

                <Stack direction="row" align="center" gap="xs" wrap>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Icon name="Pencil" size={14} />}
                    onClick={() => {
                      setRenameError(null);
                      setRenameTarget(selectedPlaythrough);
                    }}
                  >
                    Rename
                  </Button>

                  {selectedIsActive ? (
                    <Button variant="secondary" size="sm" disabled>
                      Currently Active
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Icon name="Play" size={14} />}
                      onClick={() => void handleSwitch(selectedPlaythrough.id)}
                    >
                      Load This Timeline
                    </Button>
                  )}

                  {!selectedIsActive ? (
                    <IconButton
                      icon="Trash2"
                      size="sm"
                      variant="danger"
                      label="Delete this timeline"
                      title="Delete this timeline"
                      onClick={() => {
                        setDeleteAllBranches(false);
                        setDeleteTarget(selectedPlaythrough);
                      }}
                    />
                  ) : null}
                </Stack>
              </Stack>

              {selectedLastMessage ? (
                <div className="common-hierarchy-inspector-preview">
                  <span className="common-hierarchy-node__preview-role">
                    {selectedLastMessage.role === "user" ? "You: " : "Story: "}
                  </span>
                  {selectedLastMessage.content}
                </div>
              ) : null}
            </Stack>
          </Card>
        ) : null}
      </Modal.Body>

      {renameTarget ? (
        <RenameModal
          title="Rename Timeline"
          label="Timeline name"
          initialValue={renameTarget.name}
          isSaving={renameSaving}
          errorMessage={renameError}
          onSave={(name) => {
            void handleRename(name);
          }}
          onCancel={() => {
            if (!renameSaving) {
              setRenameTarget(null);
              setRenameError(null);
            }
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete Timeline"
          message={
            selectedChildCount > 0 && playthroughs.length > 1
              ? `Delete "${deleteTarget.name}"? Choose whether to keep its child timeline branches or delete the entire timeline family.`
              : `Delete "${deleteTarget.name}"? This cannot be undone.`
          }
          confirmLabel={
            deleteAllBranches
              ? `Delete Entire Family (${playthroughs.length})`
              : "Delete This Timeline Only"
          }
          danger
          isLoading={deleteSaving}
          onConfirm={() => {
            void handleConfirmDelete();
          }}
          onCancel={() => {
            if (!deleteSaving) {
              setDeleteTarget(null);
              setDeleteAllBranches(false);
            }
          }}
        >
          {selectedChildCount > 0 && playthroughs.length > 1 ? (
            <CheckboxRow
              icon="Trash2"
              title={`Delete entire timeline family (${playthroughs.length} timelines)`}
              description="When unchecked, only this timeline is deleted and its earliest child branch is promoted to keep the rest of the family intact."
              checked={deleteAllBranches}
              disabled={deleteSaving}
              onChange={(e) => setDeleteAllBranches(e.target.checked)}
            />
          ) : null}
        </ConfirmModal>
      ) : null}
    </Modal>
  );
}
