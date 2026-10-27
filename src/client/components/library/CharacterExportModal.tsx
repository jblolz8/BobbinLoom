import { useMemo, useState } from "react";
import {
  buildCharacterFamilyTree,
  displayTitle,
  hasCcv2Source,
} from "../../../engine/characterCards";
import type { CharacterTemplate, ExportFormat } from "../../../schemas";
import {
  Badge,
  Button,
  Card,
  CharacterAvatar,
  CheckboxRow,
  FormGrid,
  Header,
  Icon,
  Modal,
  Stack,
  StatusMessage,
  Text,
} from "../base";

const EXPORT_FORMAT_OPTIONS: Array<{
  id: ExportFormat;
  title: string;
  extension: string;
  icon: "FileImage" | "Image" | "FileJson";
  hint: string;
}> = [
  {
    id: "webp",
    title: "WebP Image Card",
    extension: ".webp",
    icon: "FileImage",
    hint: "Compact Image + Embedded Data",
  },
  {
    id: "png",
    title: "PNG Image Card",
    extension: ".png",
    icon: "Image",
    hint: "Universal Image + tEXt Chunk",
  },
  {
    id: "json",
    title: "JSON Document",
    extension: ".json",
    icon: "FileJson",
    hint: "Structured Text + Base64 Images",
  },
];

export type CharacterExportModalSubmitOptions = {
  format: ExportFormat;
  includeCcv2: boolean;
  includeFamily: boolean;
  rememberFormat: boolean;
};

export interface CharacterExportModalProps {
  character: CharacterTemplate;
  allTemplates: CharacterTemplate[];
  initialFormat: ExportFormat;
  showFormatPicker: boolean;
  hasPortrait: boolean;
  exporting?: boolean;
  error?: string | null;
  onExport: (options: CharacterExportModalSubmitOptions) => void;
  onClose: () => void;
}

function getRelationshipRole(
  card: CharacterTemplate,
  primary: CharacterTemplate,
): string {
  if (card.id === primary.id) return "Primary";
  if (primary.parentId === card.id) return "Parent";
  if (card.parentId === primary.id) return "Child";
  if (primary.parentId && card.parentId === primary.parentId) return "Sibling";
  return "Variant";
}

function slugifyCardTitle(card: CharacterTemplate): string {
  const raw = displayTitle(card) || card.name || "character";
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "character";
}

function buildPreviewExportFileName(
  cards: CharacterTemplate[],
  ext: ExportFormat,
): string {
  if (cards.length <= 1) {
    const first = cards[0];
    return `${first ? slugifyCardTitle(first) : "character"}.chara.${ext}`;
  }
  const slugs = cards.map(slugifyCardTitle);
  const maxShown = 4;
  let shownSlugs = slugs.slice(0, maxShown);
  let extraCount = Math.max(0, slugs.length - shownSlugs.length);
  while (shownSlugs.length > 2 && shownSlugs.join(".").length > 120) {
    shownSlugs = shownSlugs.slice(0, -1);
    extraCount = slugs.length - shownSlugs.length;
  }
  const suffix = extraCount > 0 ? `.plus-${extraCount}-more` : "";
  return `${shownSlugs.join(".")}${suffix}.charapack.${ext}`;
}

export function CharacterExportModal({
  character,
  allTemplates,
  initialFormat,
  showFormatPicker,
  hasPortrait,
  exporting = false,
  error = null,
  onExport,
  onClose,
}: CharacterExportModalProps) {
  const [selectedFormat, setSelectedFormat] =
    useState<ExportFormat>(initialFormat);
  const [includeCcv2, setIncludeCcv2] = useState<boolean>(() =>
    hasCcv2Source(character),
  );
  const [includeFamily, setIncludeFamily] = useState<boolean>(false);
  const [rememberFormat, setRememberFormat] = useState<boolean>(false);

  const family = useMemo(
    () => buildCharacterFamilyTree(character.id, allTemplates),
    [character.id, allTemplates],
  );

  const relatedFamilyCards = useMemo(
    () =>
      family
        ? family.members.filter(
            (m) => m.id !== character.id && m.format !== "ccv2",
          )
        : [],
    [family, character.id],
  );

  const displayedCards = useMemo(
    () =>
      includeFamily && relatedFamilyCards.length > 0
        ? [character, ...relatedFamilyCards]
        : [character],
    [character, includeFamily, relatedFamilyCards],
  );

  const cardHasCcv2 = hasCcv2Source(character);
  const familyHasCcv2 = relatedFamilyCards.some((m) => hasCcv2Source(m));
  const canIncludeCcv2 = cardHasCcv2 || (includeFamily && familyHasCcv2);

  const hasAnyBundledPortrait = useMemo(
    () =>
      displayedCards.some((card) =>
        card.id === character.id
          ? hasPortrait
          : Boolean(
              card.customPortrait ||
                card.cardRef?.kind === "png" ||
                card.avatarUpdatedAt,
            ),
      ),
    [displayedCards, character.id, hasPortrait],
  );

  const willFallbackToJson =
    (selectedFormat === "webp" || selectedFormat === "png") &&
    !hasAnyBundledPortrait;
  const resolvedFormat: ExportFormat = willFallbackToJson
    ? "json"
    : selectedFormat;
  const isMultiCard = displayedCards.length > 1;
  const effectiveExtension = isMultiCard
    ? `.charapack.${resolvedFormat}`
    : `.chara.${resolvedFormat}`;
  const previewFileName = useMemo(
    () => buildPreviewExportFileName(displayedCards, resolvedFormat),
    [displayedCards, resolvedFormat],
  );

  const cardTitle = displayTitle(character);

  function handleConfirmExport() {
    onExport({
      format: selectedFormat,
      includeCcv2: canIncludeCcv2 && includeCcv2,
      includeFamily: relatedFamilyCards.length > 0 && includeFamily,
      rememberFormat: showFormatPicker && rememberFormat,
    });
  }

  return (
    <Modal
      onClose={exporting ? () => {} : onClose}
      size="md"
      fullScreenMobile
      ariaLabel={`Export ${cardTitle}`}
    >
      <Header
        variant="modal"
        icon="Download"
        title={`Export "${cardTitle}"`}
        subtitle="Configure what to bundle into the exported BobbinLoom character package."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            onClick={onClose}
            disabled={exporting}
            aria-label="Close export modal"
          >
            <Icon name="X" size={16} />
          </Button>
        }
      />

      <Modal.Content>
        <Stack direction="column" align="stretch" gap="md" fullWidth>
          {/* Bundled Character Summary Cards */}
          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <Text as="span" size="xs" weight="semibold" tone="secondary">
                {isMultiCard
                  ? `Cards to Export (${displayedCards.length})`
                  : "Card to Export"}
              </Text>
              <Badge variant="neutral" size="xs">
                {previewFileName}
              </Badge>
            </Stack>

            {displayedCards.map((card) => {
              const title = displayTitle(card);
              const role = getRelationshipRole(card, character);
              const memberHasCcv2 = hasCcv2Source(card);
              const willExportCcv2ForCard = memberHasCcv2 && includeCcv2;

              return (
                <Card key={card.id} variant="panel" padding="sm">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="sm"
                    wrap
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="sm" flex1>
                      <CharacterAvatar
                        template={card}
                        variant="custom"
                        size={44}
                      />
                      <Stack direction="column" align="start" gap="2xs" flex1>
                        <Stack direction="row" align="center" gap="xs" wrap>
                          <Text
                            as="strong"
                            size="sm"
                            weight="semibold"
                            tone="primary"
                          >
                            {title}
                          </Text>
                          {isMultiCard ? (
                            <Badge
                              variant={
                                role === "Primary" ? "accent" : "outline"
                              }
                              size="xs"
                            >
                              {role}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={willExportCcv2ForCard ? "info" : "accent"}
                            size="xs"
                          >
                            {willExportCcv2ForCard ? "CCv2 / BL" : "BL"}
                          </Badge>
                          {card.cardVersion?.trim() ? (
                            <Badge variant="neutral" size="xs">
                              {card.cardVersion.trim()}
                            </Badge>
                          ) : null}
                        </Stack>
                        {card.creator?.trim() ? (
                          <Text as="span" size="xs" tone="muted">
                            by @{card.creator.trim()}
                          </Text>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Stack>

          {/* Content & Family Options */}
          {canIncludeCcv2 || relatedFamilyCards.length > 0 ? (
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Text as="span" size="xs" weight="semibold" tone="secondary">
                Package Contents
              </Text>

              {canIncludeCcv2 ? (
                <CheckboxRow
                  icon="Layers"
                  title="Include Original CCv2 Data"
                  description="Bundle the original CCv2 sheet, creator's notes, tags, and scenario alongside the BobbinLoom sheet (CCv2 / BL). Uncheck to export as a pure BobbinLoom card."
                  checked={includeCcv2}
                  onChange={(e) => setIncludeCcv2(e.target.checked)}
                  disabled={exporting}
                />
              ) : null}

              {relatedFamilyCards.length > 0 ? (
                <CheckboxRow
                  icon="GitBranch"
                  title={`Include Related Family Cards (${relatedFamilyCards.length})`}
                  description="Bundle parent/child variant cards from this character's family tree into a .charapack file (with a combined portrait collage for .webp/.png) so they all import together with their family links intact."
                  checked={includeFamily}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIncludeFamily(next);
                    if (next && !cardHasCcv2 && familyHasCcv2) {
                      setIncludeCcv2(true);
                    }
                  }}
                  disabled={exporting}
                />
              ) : null}
            </Stack>
          ) : null}

          {/* Export Format Picker (when Always ask for Export Format is enabled) */}
          {showFormatPicker ? (
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Text as="span" size="xs" weight="semibold" tone="secondary">
                Export Format
              </Text>

              <FormGrid cols={3} gap="xs">
                {EXPORT_FORMAT_OPTIONS.map((opt) => {
                  const isSelected = selectedFormat === opt.id;
                  return (
                    <Card
                      key={opt.id}
                      as="button"
                      type="button"
                      variant="elevated"
                      padding="sm"
                      active={isSelected}
                      hoverable
                      aria-pressed={isSelected}
                      disabled={exporting}
                      onClick={() => setSelectedFormat(opt.id)}
                    >
                      <Stack
                        direction="column"
                        align="start"
                        gap="2xs"
                        fullWidth
                      >
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          wrap
                          fullWidth
                        >
                          <Stack direction="row" align="center" gap="xs">
                            <Icon name={opt.icon} size={16} />
                            <Badge variant="neutral" size="xs">
                              {opt.extension}
                            </Badge>
                          </Stack>
                          {isSelected ? (
                            <Badge variant="accent" size="xs">
                              Selected
                            </Badge>
                          ) : null}
                        </Stack>
                        <Text
                          as="strong"
                          size="xs"
                          weight="semibold"
                          tone="primary"
                        >
                          {opt.title}
                        </Text>
                        <Text as="span" variant="caption" tone="muted">
                          {opt.hint}
                        </Text>
                      </Stack>
                    </Card>
                  );
                })}
              </FormGrid>

              <CheckboxRow
                icon="HardDrive"
                title="Always Remember Export Format"
                description="Save this format in Settings > Files and Storage and skip asking for the export format next time."
                checked={rememberFormat}
                onChange={(e) => setRememberFormat(e.target.checked)}
                disabled={exporting}
              />
            </Stack>
          ) : null}

          {willFallbackToJson ? (
            <StatusMessage variant="inline" tone="warn" icon="AlertCircle">
              <strong>&quot;{cardTitle}&quot;</strong> does not have a portrait
              image, so it will be exported as a <strong>.json</strong> file
              instead of <strong>.{selectedFormat}</strong>.
            </StatusMessage>
          ) : null}

          {error ? (
            <StatusMessage variant="inline" tone="err" icon="AlertTriangle">
              {error}
            </StatusMessage>
          ) : null}
        </Stack>
      </Modal.Content>

      <Modal.Footer>
        <Stack direction="row" align="center" justify="end" gap="sm" fullWidth>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon="Download"
            onClick={handleConfirmExport}
            disabled={exporting}
            isLoading={exporting}
          >
            {exporting ? "Exporting…" : `Export (${effectiveExtension})`}
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}

export default CharacterExportModal;
