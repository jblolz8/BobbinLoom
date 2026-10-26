import { useMemo, useState, type ReactNode } from "react";
import type { CharacterTemplate } from "../../../../schemas";
import {
  buildCharacterFamilyTree,
  cardBadgeLabel,
  displayTitle,
  groupByLineage,
  hasCcv2Source,
  hasDistinctTitle,
  type CharacterFamilyNode,
} from "../../../../engine/characterCards";
import {
  Badge,
  Button,
  Card,
  CharacterAvatar,
  CheckboxRow,
  Header,
  Icon,
  Modal,
  Separator,
  SimpleSelect,
  Stack,
  StatusMessage,
  Text,
} from "../../base";

export type CardFamilyModalProps = {
  focusId: string;
  allTemplates: CharacterTemplate[];
  busy?: boolean;
  error?: string | null;
  onSelectFocus: (id: string) => void;
  onOpenEditor?: (template: CharacterTemplate) => void;
  onSetParent: (
    cardId: string,
    parentId: string | undefined,
    options?: { detachCcv2?: boolean },
  ) => Promise<void> | void;
  onDetachCcv2: (cardId: string) => Promise<void> | void;
  onCreateVariant: (parentId: string) => Promise<void> | void;
  onClose: () => void;
};

export function CardFamilyModal({
  focusId,
  allTemplates,
  busy = false,
  error = null,
  onSelectFocus,
  onOpenEditor,
  onSetParent,
  onDetachCcv2,
  onCreateVariant,
  onClose,
}: CardFamilyModalProps) {
  const [selectedChildCandidateId, setSelectedChildCandidateId] = useState("");
  const [detachOnLink, setDetachOnLink] = useState(true);

  const latestCards = useMemo(
    () =>
      groupByLineage(allTemplates, "name", "asc")
        .map((g) => g.versions[0])
        .filter((t): t is CharacterTemplate => t !== undefined),
    [allTemplates],
  );

  const family = useMemo(
    () => buildCharacterFamilyTree(focusId, allTemplates),
    [focusId, allTemplates],
  );

  // Valid parent candidates for `family.focus` (cannot be self or a descendant of focus)
  const parentCandidates = useMemo(() => {
    if (!family) return [];
    const focusNameLower = family.focus.name.trim().toLowerCase();
    return latestCards
      .filter(
        (c) => c.id !== family.focus.id && !family.descendantIds.has(c.id),
      )
      .sort((a, b) => {
        const aSameName = a.name.trim().toLowerCase() === focusNameLower;
        const bSameName = b.name.trim().toLowerCase() === focusNameLower;
        if (aSameName !== bSameName) return aSameName ? -1 : 1;
        return displayTitle(a).localeCompare(displayTitle(b));
      });
  }, [family, latestCards]);

  const parentSelectOptions = useMemo(() => {
    if (!family) return [];
    const focusNameLower = family.focus.name.trim().toLowerCase();
    return [
      { value: "", label: "None — Root / Standalone Card" },
      ...parentCandidates.map((c) => {
        const isSameName = c.name.trim().toLowerCase() === focusNameLower;
        const badge = cardBadgeLabel(c);
        const fmt =
          badge === "ccv2" ? "CCv2" : badge === "ccv2bl" ? "CCv2 / BL" : "BL";
        return {
          value: c.id,
          label: `${displayTitle(c)} (${fmt}${isSameName ? ` • Same character: ${c.name}` : ` • Name: ${c.name}`})`,
        };
      }),
    ];
  }, [family, parentCandidates]);

  // Cards that can be linked as a direct child of `family.focus`
  // (excluding self, current direct children of focus, and ancestors of focus to avoid cycles)
  const ancestorIds = useMemo(() => {
    const set = new Set<string>();
    if (!family) return set;
    const byId = new Map(latestCards.map((c) => [c.id, c]));
    let curr: CharacterTemplate | undefined = family.focus;
    while (curr?.parentId) {
      if (set.has(curr.parentId)) break;
      set.add(curr.parentId);
      curr = byId.get(curr.parentId);
    }
    return set;
  }, [family, latestCards]);

  const childCandidates = useMemo(() => {
    if (!family) return [];
    const focusNameLower = family.focus.name.trim().toLowerCase();
    const directChildIds = new Set(family.children.map((c) => c.id));
    return latestCards
      .filter(
        (c) =>
          c.id !== family.focus.id &&
          !directChildIds.has(c.id) &&
          !ancestorIds.has(c.id),
      )
      .sort((a, b) => {
        const aSameName = a.name.trim().toLowerCase() === focusNameLower;
        const bSameName = b.name.trim().toLowerCase() === focusNameLower;
        if (aSameName !== bSameName) return aSameName ? -1 : 1;
        return displayTitle(a).localeCompare(displayTitle(b));
      });
  }, [family, latestCards, ancestorIds]);

  // Same-name standalone cards not yet in this family tree (e.g. "Averi" and "Averi - Bully")
  const suggestedSameNameCards = useMemo(() => {
    if (!family) return [];
    const focusNameLower = family.focus.name.trim().toLowerCase();
    const memberIds = new Set(family.members.map((m) => m.id));
    return childCandidates.filter(
      (c) =>
        !memberIds.has(c.id) && c.name.trim().toLowerCase() === focusNameLower,
    );
  }, [family, childCandidates]);

  const childSelectOptions = useMemo(() => {
    if (!family) return [];
    const focusNameLower = family.focus.name.trim().toLowerCase();
    return [
      { value: "", label: "Select a card from the library to link as Child…" },
      ...childCandidates.map((c) => {
        const isSameName = c.name.trim().toLowerCase() === focusNameLower;
        const badge = cardBadgeLabel(c);
        const fmt =
          badge === "ccv2" ? "CCv2" : badge === "ccv2bl" ? "CCv2 / BL" : "BL";
        return {
          value: c.id,
          label: `${displayTitle(c)} (${fmt}${isSameName ? ` • Same character: ${c.name}` : ` • Name: ${c.name}`})`,
        };
      }),
    ];
  }, [family, childCandidates]);

  if (!family) return null;

  function renderTreeNodes(node: CharacterFamilyNode): ReactNode {
    const card = node.template;
    const isFocused = card.id === family!.focus.id;
    const isRoot = node.depth === 0;
    const badge = cardBadgeLabel(card);
    const canDetachCcv2 = hasCcv2Source(card);

    return (
      <Stack
        key={card.id}
        direction="column"
        align="stretch"
        gap="xs"
        fullWidth
      >
        <Stack direction="row" align="center" gap="xs" fullWidth>
          {node.depth > 0 ? (
            <Stack direction="row" align="center" gap="2xs">
              {Array.from({ length: Math.max(0, node.depth - 1) }).map(
                (_, idx) => (
                  <Text key={idx} as="span" size="xs" tone="muted">
                    │
                  </Text>
                ),
              )}
              <Icon
                name="CornerDownRight"
                size={15}
                className="ds-icon-muted"
              />
            </Stack>
          ) : null}

          <Card
            variant={isFocused ? "elevated" : "panel"}
            active={isFocused}
            padding="xs"
            fullWidth
          >
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="sm"
              wrap
              fullWidth
            >
              <Stack direction="row" align="center" gap="sm" wrap flex1>
                <CharacterAvatar template={card} variant="list" />
                <Stack direction="column" align="start" gap="2xs">
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Card.TitleButton
                      title={`Select ${displayTitle(card)}`}
                      onClick={() => onSelectFocus(card.id)}
                    >
                      <Text as="span" size="sm" weight="semibold">
                        {displayTitle(card)}
                      </Text>
                    </Card.TitleButton>

                    {isFocused ? (
                      <Badge variant="accent" size="xs">
                        Selected
                      </Badge>
                    ) : null}

                    {isRoot && family!.members.length > 1 ? (
                      <Badge variant="outline" size="xs" leftIcon="GitBranch">
                        Root Parent
                      </Badge>
                    ) : null}

                    {!isRoot ? (
                      <Badge variant="neutral" size="xs">
                        Child Variant
                      </Badge>
                    ) : null}
                  </Stack>

                  <Stack direction="row" align="center" gap="2xs" wrap>
                    {hasDistinctTitle(card) ? (
                      <Badge
                        variant="outline"
                        size="xs"
                        leftIcon="User"
                        title={`In-story character name: ${card.name}`}
                      >
                        {card.name}
                      </Badge>
                    ) : null}
                    {badge === "ccv2" ? (
                      <Badge variant="warning" size="xs">
                        CCv2
                      </Badge>
                    ) : null}
                    {badge === "ccv2bl" ? (
                      <Badge variant="info" size="xs">
                        CCv2 / BL
                      </Badge>
                    ) : null}
                    {badge === null ? (
                      <Badge variant="accent" size="xs">
                        BL
                      </Badge>
                    ) : null}
                    <Badge variant="neutral" size="xs">
                      v{card.cardVersion ?? String(card.version)}
                    </Badge>
                  </Stack>
                </Stack>
              </Stack>

              <Stack direction="row" align="center" gap="xs" wrap>
                {canDetachCcv2 ? (
                  <Button
                    variant={!isRoot ? "primary" : "secondary"}
                    size="xs"
                    leftIcon="Unlink"
                    disabled={busy}
                    onClick={() => void onDetachCcv2(card.id)}
                    title="Cut ties to the embedded CCv2 source so this card becomes a pure BobbinLoom (BL) card while keeping its portrait art, sheet, and tags"
                  >
                    Make Pure BL (Cut CCv2 Ties)
                  </Button>
                ) : null}

                {!isRoot ? (
                  <Button
                    variant="secondary"
                    size="xs"
                    leftIcon="X"
                    disabled={busy}
                    onClick={() => void onSetParent(card.id, undefined)}
                    title="Unlink this variant from its parent card"
                  >
                    Unlink Parent
                  </Button>
                ) : null}

                {onOpenEditor ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    leftIcon="Pencil"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onOpenEditor(card);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Card>
        </Stack>

        {node.children.length > 0 ? (
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            {node.children.map((child) => renderTreeNodes(child))}
          </Stack>
        ) : null}
      </Stack>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      fullScreenMobile
      ariaLabel={`Card Family for ${displayTitle(family.focus)}`}
    >
      <Header
        variant="section"
        icon="GitBranch"
        title={`Card Family — ${displayTitle(family.focus)}`}
        subtitle="Link Parent, Child, and Sibling character variants, or cut duplicate CCv2 ties on child variants."
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon="Copy"
            disabled={busy}
            onClick={() => void onCreateVariant(family.focus.id)}
            title="Duplicate this card as a new pure-BL child variant linked under this card"
          >
            New Child Variant
          </Button>
        }
      />

      <Modal.Body>
        <Modal.Content>
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            {error ? (
              <StatusMessage variant="banner" tone="err">
                {error}
              </StatusMessage>
            ) : null}

            {/* 1. Visual Tree Hierarchy */}
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="xs"
                wrap
                fullWidth
              >
                <Stack direction="row" align="center" gap="xs">
                  <Icon
                    name="GitBranch"
                    size={15}
                    className="ds-icon-accent"
                  />
                  <Text size="sm" weight="semibold">
                    Family Hierarchy ({family.members.length}{" "}
                    {family.members.length === 1 ? "card" : "cards"})
                  </Text>
                </Stack>
                <Text size="xs" tone="muted">
                  Click any card in the tree to focus and manage its links.
                </Text>
              </Stack>

              {renderTreeNodes(family.tree)}
            </Stack>

            <Separator spacing="none" />

            {/* 2. Quick Suggestions for Same-Name Variants */}
            {suggestedSameNameCards.length > 0 ? (
              <Card variant="elevated" padding="sm" fullWidth>
                <Stack direction="column" align="stretch" gap="xs" fullWidth>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Badge variant="accent" size="xs" leftIcon="Sparkles">
                      Matching Character Name: {family.focus.name}
                    </Badge>
                    <Text size="xs" tone="secondary">
                      Found other unlinked cards sharing the in-story name{" "}
                      <strong>{family.focus.name}</strong>:
                    </Text>
                  </Stack>

                  <Stack direction="column" align="stretch" gap="xs" fullWidth>
                    {suggestedSameNameCards.map((candidate) => {
                      const candBadge = cardBadgeLabel(candidate);
                      return (
                        <Card
                          key={candidate.id}
                          variant="panel"
                          padding="xs"
                          fullWidth
                        >
                          <Stack
                            direction="row"
                            align="center"
                            justify="between"
                            gap="sm"
                            wrap
                            fullWidth
                          >
                            <Stack
                              direction="row"
                              align="center"
                              gap="sm"
                              wrap
                            >
                              <CharacterAvatar
                                template={candidate}
                                variant="list"
                              />
                              <Stack
                                direction="row"
                                align="center"
                                gap="xs"
                                wrap
                              >
                                <Text size="sm" weight="semibold">
                                  {displayTitle(candidate)}
                                </Text>
                                {candBadge === "ccv2" ? (
                                  <Badge variant="warning" size="xs">
                                    CCv2
                                  </Badge>
                                ) : candBadge === "ccv2bl" ? (
                                  <Badge variant="info" size="xs">
                                    CCv2 / BL
                                  </Badge>
                                ) : (
                                  <Badge variant="accent" size="xs">
                                    BL
                                  </Badge>
                                )}
                              </Stack>
                            </Stack>

                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                            >
                              <Button
                                variant="primary"
                                size="xs"
                                leftIcon="GitBranch"
                                disabled={busy}
                                onClick={() =>
                                  void onSetParent(
                                    candidate.id,
                                    family.focus.id,
                                    {
                                      detachCcv2:
                                        detachOnLink &&
                                        hasCcv2Source(candidate),
                                    },
                                  )
                                }
                              >
                                Link as Child of {displayTitle(family.focus)}
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                disabled={busy}
                                onClick={() =>
                                  void onSetParent(
                                    family.focus.id,
                                    candidate.id,
                                    {
                                      detachCcv2:
                                        detachOnLink &&
                                        hasCcv2Source(family.focus),
                                    },
                                  )
                                }
                              >
                                Set as Parent of {displayTitle(family.focus)}
                              </Button>
                            </Stack>
                          </Stack>
                        </Card>
                      );
                    })}
                  </Stack>
                </Stack>
              </Card>
            ) : null}

            {/* 3. Parent & Child Link Controls for the Selected Card */}
            <Card variant="panel" padding="sm" fullWidth>
              <Stack direction="column" align="stretch" gap="sm" fullWidth>
                <Text size="sm" weight="semibold">
                  Manage Links for &ldquo;{displayTitle(family.focus)}&rdquo;
                </Text>

                <CheckboxRow
                  icon="Unlink"
                  title="Detach CCv2 source on child variants"
                  description="When linking a converted CCv2 / BL card as a Child variant, automatically strip its duplicate CCv2 backup so it becomes a pure BobbinLoom (BL) card while the Root Parent keeps the CCv2 source."
                  checked={detachOnLink}
                  disabled={busy}
                  onChange={(e) => setDetachOnLink(e.target.checked)}
                />

                <SimpleSelect
                  label={`Parent Card of "${displayTitle(family.focus)}"`}
                  labelIcon="GitBranch"
                  size="sm"
                  variant="filled"
                  fullWidth
                  value={family.parent?.id ?? ""}
                  options={parentSelectOptions}
                  disabled={busy}
                  onChange={(nextParentId) =>
                    void onSetParent(
                      family.focus.id,
                      nextParentId || undefined,
                      {
                        detachCcv2:
                          Boolean(nextParentId) &&
                          detachOnLink &&
                          hasCcv2Source(family.focus),
                      },
                    )
                  }
                  aria-label="Select Parent Card"
                />

                <Stack
                  direction="row"
                  align="end"
                  gap="xs"
                  fullWidth
                  stackBelow="sm"
                >
                  <Stack direction="column" align="stretch" flex1 fullWidth>
                    <SimpleSelect
                      label={`Add Existing Card as Child of "${displayTitle(family.focus)}"`}
                      labelIcon="Plus"
                      size="sm"
                      variant="filled"
                      fullWidth
                      value={selectedChildCandidateId}
                      options={childSelectOptions}
                      disabled={busy || childCandidates.length === 0}
                      onChange={setSelectedChildCandidateId}
                      aria-label="Select Card to Link as Child"
                    />
                  </Stack>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="GitBranch"
                    disabled={busy || !selectedChildCandidateId}
                    onClick={() => {
                      if (!selectedChildCandidateId) return;
                      const targetId = selectedChildCandidateId;
                      const targetCard = latestCards.find(
                        (c) => c.id === targetId,
                      );
                      setSelectedChildCandidateId("");
                      void onSetParent(targetId, family.focus.id, {
                        detachCcv2:
                          detachOnLink &&
                          Boolean(targetCard && hasCcv2Source(targetCard)),
                      });
                    }}
                  >
                    Link as Child
                  </Button>
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        <Stack direction="row" align="center" justify="end" gap="sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Done
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
