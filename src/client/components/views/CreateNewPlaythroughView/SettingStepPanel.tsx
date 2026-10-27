import { useMemo, useState } from "react";
import type { LorebookSummary } from "../../../../schemas";
import { usePagination } from "../../../hooks/usePagination";
import {
  Accordion,
  Badge,
  Button,
  Card,
  CheckboxRow,
  FormGrid,
  FormSection,
  Icon,
  IconButton,
  Pagination,
  SearchBar,
  Separator,
  SimpleSelect,
  Stack,
  StatusMessage,
  Text,
  TextArea,
  TextInput,
} from "../../base";
import type { SetupFormState } from "./CreateNewPlaythroughView";

export type SettingStepPanelProps = {
  lorebookLibrary: LorebookSummary[];
  selectedLorebookIds: string[];
  onToggleLorebookId: (id: string) => void;
  onOpenLorebookManager?: () => void;
  showLorebooks?: boolean;
  onChangeShowLorebooks?: (open: boolean) => void;
  cardSettings: Array<{ title: string; scenario: string }>;
  setupForm: SetupFormState;
  onSetupFormChange: (updater: (f: SetupFormState) => SetupFormState) => void;
  textProviderOptions: Array<{ value: string; label: string }>;
  onProviderChange: (id: string) => void;
  characterProviderId: string;
  characterProviderOptions: Array<{ value: string; label: string }>;
  onCharacterProviderChange: (id: string) => void;
  providerChoiceError: string | null;
  genError: string | null;
  onGenerate: () => void;
  onStartBlank: () => void;
};

export function SettingStepPanel({
  lorebookLibrary,
  selectedLorebookIds,
  onToggleLorebookId,
  onOpenLorebookManager,
  showLorebooks,
  onChangeShowLorebooks,
  cardSettings,
  setupForm,
  onSetupFormChange,
  textProviderOptions,
  onProviderChange,
  characterProviderId,
  characterProviderOptions,
  onCharacterProviderChange,
  providerChoiceError,
  genError,
  onGenerate,
  onStartBlank,
}: SettingStepPanelProps) {
  const [lorebookSearch, setLorebookSearch] = useState("");

  const selectedLorebooks = useMemo(
    () => lorebookLibrary.filter((lb) => selectedLorebookIds.includes(lb.id)),
    [lorebookLibrary, selectedLorebookIds],
  );

  const filteredLorebooks = useMemo(() => {
    const q = lorebookSearch.trim().toLowerCase();
    if (!q) return lorebookLibrary;
    return lorebookLibrary.filter((lb) => lb.name.toLowerCase().includes(q));
  }, [lorebookLibrary, lorebookSearch]);

  const lorebookPager = usePagination({
    items: filteredLorebooks,
    persistAs: "setupLorebook",
    resetDeps: [lorebookSearch],
  });

  const selectedCount = selectedLorebookIds.length;

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* Lorebooks Accordion Section */}
      <Accordion
        variant="elevated"
        icon="BookOpen"
        title="Lorebooks"
        open={showLorebooks}
        defaultOpen={false}
        onOpenChange={onChangeShowLorebooks}
        badge={
          <Badge
            variant={selectedCount > 0 ? "accent" : "neutral"}
            size="xs"
            pill
          >
            {selectedCount} selected
          </Badge>
        }
        description="World Info lorebooks are automatically scanned for keyword matches each turn."
        action={
          onOpenLorebookManager ? (
            <Button
              variant="secondary"
              size="xs"
              leftIcon="BookOpen"
              onClick={onOpenLorebookManager}
            >
              Manage Lorebooks
            </Button>
          ) : undefined
        }
        summary={
          selectedLorebooks.length > 0 ? (
            <Stack direction="row" align="center" gap="xs" wrap fullWidth>
              {selectedLorebooks.map((lb) => (
                <Badge
                  key={lb.id}
                  variant="accent"
                  size="sm"
                  pill
                  truncate
                  maxWidth={220}
                  title={lb.name}
                  leftIcon="BookOpen"
                  rightIcon={
                    <IconButton
                      icon="X"
                      size="xs"
                      variant="ghost"
                      onClick={() => onToggleLorebookId(lb.id)}
                      label={`Remove ${lb.name}`}
                      title={`Remove ${lb.name}`}
                    />
                  }
                >
                  {lb.name}
                </Badge>
              ))}
            </Stack>
          ) : undefined
        }
      >
        {lorebookLibrary.length === 0 ? (
          <Card variant="panel" padding="sm" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="sm"
              wrap
              fullWidth
            >
              <Text size="xs" tone="secondary">
                No lorebooks imported yet. Import lorebooks in the Lorebook
                Manager or proceed without world info.
              </Text>
              {onOpenLorebookManager ? (
                <Button
                  variant="secondary"
                  size="xs"
                  leftIcon="Plus"
                  onClick={onOpenLorebookManager}
                >
                  Open Lorebook Manager
                </Button>
              ) : null}
            </Stack>
          </Card>
        ) : (
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            {lorebookLibrary.length > 6 ? (
              <SearchBar
                value={lorebookSearch}
                onChange={setLorebookSearch}
                onClear={() => setLorebookSearch("")}
                placeholder="Filter lorebooks by name…"
                size="sm"
                flex1
                aria-label="Filter lorebooks"
              />
            ) : null}

            {filteredLorebooks.length === 0 ? (
              <Card variant="panel" padding="sm" fullWidth>
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="sm"
                  wrap
                  fullWidth
                >
                  <Text size="xs" tone="secondary">
                    No lorebooks match &ldquo;{lorebookSearch}&rdquo;.
                  </Text>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setLorebookSearch("")}
                  >
                    Clear Filter
                  </Button>
                </Stack>
              </Card>
            ) : (
              <>
                <FormGrid cols={3} gap="sm">
                  {lorebookPager.pageItems.map((lb) => {
                    const isSelected = selectedLorebookIds.includes(lb.id);
                    return (
                      <Card
                        key={lb.id}
                        variant="panel"
                        padding="xs"
                        layout="column"
                        hoverable
                        active={isSelected}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onClick={() => onToggleLorebookId(lb.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleLorebookId(lb.id);
                          }
                        }}
                      >
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          fullWidth
                        >
                          <Stack
                            direction="row"
                            align="center"
                            gap="xs"
                            flex1
                            fullWidth
                          >
                            <Icon name="BookOpen" size={14} />
                            <Text
                              size="sm"
                              weight="semibold"
                              truncate
                              title={lb.name}
                            >
                              {lb.name}
                            </Text>
                          </Stack>

                          <Card.SelectIndicator checked={isSelected} />
                        </Stack>

                        <Stack direction="row" align="center" gap="xs" wrap>
                          <Badge variant="info" size="xs">
                            {lb.entryCount}{" "}
                            {lb.entryCount === 1 ? "entry" : "entries"}
                          </Badge>
                          <Badge variant="neutral" size="xs">
                            Depth: {lb.scanDepth}
                          </Badge>
                        </Stack>
                      </Card>
                    );
                  })}
                </FormGrid>

                <Pagination
                  page={lorebookPager.page}
                  pageSize={lorebookPager.pageSize}
                  total={lorebookPager.totalItems}
                  onPageChange={lorebookPager.setPage}
                  onPageSizeChange={lorebookPager.setPageSize}
                  onCommitCustomPageSize={lorebookPager.commitCustomPageSize}
                  itemLabel="lorebooks"
                />
              </>
            )}
          </Stack>
        )}
      </Accordion>

      <Separator spacing="none" />

      {/* Playthrough Details & Opening Style */}
      <FormSection
        icon="Sparkles"
        title="World Setting & Opening Scene"
        description="Name your playthrough, describe the initial premise, and configure opening generation options."
      >
        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          <TextInput
            label="Playthrough Name"
            value={setupForm.name}
            onChange={(e) =>
              onSetupFormChange((f) => ({
                ...f,
                name: e.target.value,
              }))
            }
            placeholder="e.g. Dragon's Rest"
          />

          <TextArea
            label="World Setting & Starting Scenario"
            helperText="Describe the world, tone, genre, factions, and initial situation. The AI uses this to craft your scenario."
            value={setupForm.setting}
            onChange={(e) =>
              onSetupFormChange((f) => ({
                ...f,
                setting: e.target.value,
              }))
            }
            rows={4}
            autoGrow
            autoGrowMax={240}
            placeholder="Describe the world, tone, genre, factions, and initial situation. Include starting location or goals..."
          />

          {cardSettings.length > 0 ? (
            <SimpleSelect
              label="Use Existing Card Scenario"
              helperText="Optionally populate the world setting from an imported character card's scenario."
              value=""
              placeholder="Choose a card scenario…"
              fullWidth
              size="md"
              options={cardSettings.map((s) => ({
                value: s.scenario,
                label: s.title,
              }))}
              onChange={(scenario) => {
                if (!scenario) return;
                const picked = cardSettings.find(
                  (s) => s.scenario === scenario,
                );
                if (picked)
                  onSetupFormChange((f) => ({
                    ...f,
                    setting: picked.scenario,
                  }));
              }}
              aria-label="Choose a card scenario"
            />
          ) : null}

          <Separator spacing="xs" />

          <Stack direction="column" align="stretch" gap="xs" fullWidth>
            <Text size="xs" weight="semibold" tone="secondary">
              Opening Style
            </Text>
            <FormGrid cols={2} gap="sm">
              <Card
                variant="elevated"
                padding="sm"
                hoverable
                active={setupForm.openingMode === "quick"}
                role="radio"
                aria-checked={setupForm.openingMode === "quick"}
                tabIndex={0}
                onClick={() =>
                  onSetupFormChange((f) => ({
                    ...f,
                    openingMode: "quick",
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSetupFormChange((f) => ({
                      ...f,
                      openingMode: "quick",
                    }));
                  }
                }}
              >
                <Stack direction="column" align="stretch" gap="2xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Text size="sm" weight="semibold">
                      Quick start
                    </Text>
                    {setupForm.openingMode === "quick" ? (
                      <Badge variant="accent" size="xs">
                        Selected
                      </Badge>
                    ) : null}
                  </Stack>
                  <Text size="xs" tone="secondary">
                    Scenario + short opening · 1 call · faster
                  </Text>
                </Stack>
              </Card>

              <Card
                variant="elevated"
                padding="sm"
                hoverable
                active={setupForm.openingMode === "fleshedOut"}
                role="radio"
                aria-checked={setupForm.openingMode === "fleshedOut"}
                tabIndex={0}
                onClick={() =>
                  onSetupFormChange((f) => ({
                    ...f,
                    openingMode: "fleshedOut",
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSetupFormChange((f) => ({
                      ...f,
                      openingMode: "fleshedOut",
                    }));
                  }
                }}
              >
                <Stack direction="column" align="stretch" gap="2xs" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    fullWidth
                  >
                    <Text size="sm" weight="semibold">
                      Fleshed-out opening
                    </Text>
                    {setupForm.openingMode === "fleshedOut" ? (
                      <Badge variant="accent" size="xs">
                        Selected
                      </Badge>
                    ) : null}
                  </Stack>
                  <Text size="xs" tone="secondary">
                    Generate, then write rich first scene · 2 calls · immersive
                  </Text>
                </Stack>
              </Card>
            </FormGrid>
          </Stack>

          <CheckboxRow
            icon="UserPlus"
            title="Allow AI to invent additional characters"
            description="Let the story introduce new characters organically as events unfold, or restrict encounters strictly to your selected cast."
            checked={setupForm.allowAdditionalCharacters}
            onChange={(e) =>
              onSetupFormChange((f) => ({
                ...f,
                allowAdditionalCharacters: e.target.checked,
              }))
            }
          />

          <CheckboxRow
            icon="ListOrdered"
            title="Generate Initial Choices"
            description="Provide 3 suggested action choices at the end of the opening scene to kickstart gameplay."
            checked={setupForm.generateOpeningChoices}
            onChange={(e) =>
              onSetupFormChange((f) => ({
                ...f,
                generateOpeningChoices: e.target.checked,
              }))
            }
          />
        </Stack>
      </FormSection>

      <Separator spacing="none" />

      {/* Text Providers Section */}
      <FormSection
        icon="Cpu"
        title="Text Providers"
        description="Choose which text connections generate the world scenario and flesh out character sheets. Falls back to the active connection if the chosen one is deleted."
      >
        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          <FormGrid cols={2} gap="md">
            <SimpleSelect
              label="Playthrough Creation"
              helperText="Writes the world and the opening scene. Later turns follow the active connection."
              size="sm"
              variant="filled"
              fullWidth
              value={setupForm.providerId}
              onChange={onProviderChange}
              options={textProviderOptions}
              placeholder="Current active text provider"
              aria-label="Text provider for Playthrough Creation"
            />

            <SimpleSelect
              label="Character Flesh Out"
              helperText="Builds detailed character sheets during scenario generation and mid-turn automation."
              size="sm"
              variant="filled"
              fullWidth
              value={characterProviderId}
              onChange={onCharacterProviderChange}
              options={characterProviderOptions}
              placeholder="Current active text provider"
              aria-label="Text provider for Character Flesh Out"
            />
          </FormGrid>

          {providerChoiceError ? (
            <StatusMessage variant="banner" tone="err">
              {providerChoiceError}
            </StatusMessage>
          ) : null}
        </Stack>
      </FormSection>

      {/* Error Box if previous attempt failed */}
      {genError ? (
        <StatusMessage variant="banner" tone="err">
          <Stack direction="column" align="start" gap="xs">
            <Text size="sm">{genError}</Text>
            <Stack direction="row" align="center" gap="xs" wrap>
              <Button
                variant="secondary"
                size="sm"
                leftIcon="RotateCcw"
                onClick={onGenerate}
              >
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon="FilePlus"
                onClick={onStartBlank}
              >
                Use Start Blank Instead
              </Button>
            </Stack>
          </Stack>
        </StatusMessage>
      ) : null}
    </Stack>
  );
}
