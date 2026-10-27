import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Card,
  FormSection,
  Icon,
  Separator,
  SimpleSelect,
  Stack,
  StatusMessage,
  Text,
  type IconName,
  type SimpleSelectOption,
} from "../base";
import {
  getBrainstormSettings,
  listProviderConnections,
  setBrainstormSettings,
  setChapterTextProvider,
  setCharacterTextProvider,
  setGenerationTextProvider,
  setTagTextProvider,
  updateProviderConnection,
  type ProviderConnection,
  type ProviderRegistry,
} from "../../api";

type OverrideFieldRowProps = {
  icon: IconName;
  label: string;
  value: string;
  options: SimpleSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  badges?: ReactNode;
};

function OverrideFieldRow({
  icon,
  label,
  value,
  options,
  onChange,
  ariaLabel,
  badges,
}: OverrideFieldRowProps) {
  return (
    <Card variant="panel" padding="xs">
      <Stack direction="column" align="stretch" gap="2xs">
        <Stack direction="row" align="center" justify="between" gap="xs" wrap>
          <Stack direction="row" align="center" gap="xs">
            <Icon name={icon} size={14} className="ds-icon-accent" />
            <Text as="span" size="xs" weight="semibold" tone="primary">
              {label}
            </Text>
          </Stack>
          {badges && (
            <Stack direction="row" align="center" gap="2xs" wrap>
              {badges}
            </Stack>
          )}
        </Stack>
        <SimpleSelect
          size="sm"
          variant="filled"
          fullWidth
          value={value}
          onChange={onChange}
          options={options}
          aria-label={ariaLabel}
        />
      </Stack>
    </Card>
  );
}

export type ProviderOverridesPanelProps = {
  active?: boolean;
};

export function ProviderOverridesPanel({
  active = true,
}: ProviderOverridesPanelProps) {
  const [registry, setRegistry] = useState<ProviderRegistry | null>(null);
  const [brainstormProviderId, setBrainstormProviderId] = useState<string>("");
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!active) return;
    listProviderConnections()
      .then(setRegistry)
      .catch((err) =>
        setStatus({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        }),
      );
    getBrainstormSettings()
      .then((settings) => {
        setBrainstormProviderId(settings.textProviderId ?? "");
      })
      .catch(() => {
        /* Defaults apply when settings cannot be read. */
      });
  }, [active]);

  const textConnections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === "text"),
    [registry],
  );

  const imageConnections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === "image"),
    [registry],
  );

  const activeText = useMemo(
    () => textConnections.find((c) => c.id === registry?.activeTextProviderId),
    [textConnections, registry?.activeTextProviderId],
  );

  const textOptions = useMemo(
    () => [
      {
        value: "",
        label: activeText
          ? `Follow active (${activeText.label})`
          : "Follow active text provider",
      },
      ...textConnections.map((c) => ({ value: c.id, label: c.label })),
    ],
    [textConnections, activeText],
  );

  async function handleImagePromptWriterChange(
    img: ProviderConnection,
    nextProviderId: string,
  ) {
    setStatus(null);
    try {
      await updateProviderConnection(img.id, {
        kind: "image",
        label: img.label,
        baseUrl: img.baseUrl,
        model: img.model,
        apiStyle: img.apiStyle ?? "openai",
        safeMode: img.safeMode,
        size: img.size,
        aspectRatio: img.aspectRatio,
        promptProviderId: nextProviderId || null,
        stylePreset: img.stylePreset,
        hideWatermark: img.hideWatermark,
        variants: img.variants,
        seed: img.seed,
        steps: img.steps,
        cfgScale: img.cfgScale,
        sampler: img.sampler,
        scheduler: img.scheduler,
        timeoutMs: img.timeoutMs,
        regionsEnabled: img.regionsEnabled,
        regionDirection: img.regionDirection,
        temperature: img.temperature,
        maxTokens: img.maxTokens,
        contextWindow: img.contextWindow,
      });
      const updated = await listProviderConnections();
      setRegistry(updated);
    } catch (err) {
      setStatus({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function renderOverrideStatusBadge(
    selectedId?: string | null,
    missing = false,
  ) {
    if (missing) {
      return (
        <Badge variant="warning" size="xs" leftIcon="AlertTriangle">
          Writer missing
        </Badge>
      );
    }
    if (selectedId) {
      return (
        <Badge variant="info" size="xs" leftIcon="Sliders">
          Custom override
        </Badge>
      );
    }
    return (
      <Badge variant="outline" size="xs">
        Following active
      </Badge>
    );
  }

  const genProviderId = registry?.generationTextProviderId ?? "";
  const chapterProviderId = registry?.chapterTextProviderId ?? "";
  const charProviderId = registry?.characterTextProviderId ?? "";
  const tagProviderId = registry?.tagTextProviderId ?? "";

  return (
    <Stack direction="column" align="stretch" gap="sm">
      {status && (
        <StatusMessage
          variant="banner"
          tone={status.kind}
          onDismiss={() => setStatus(null)}
        >
          {status.text}
        </StatusMessage>
      )}

      <Card variant="elevated" padding="md">
        <Stack direction="column" align="stretch" gap="sm">
          <FormSection
            icon="Sliders"
            title="Text Workflow Overrides"
            description="Assign dedicated text connections to specific tasks (e.g. a reasoning model for story setup, chapter compaction, or character creation while keeping a fast model active for chat turns)."
            action={
              activeText ? (
                <Badge variant="neutral" size="xs" leftIcon="Zap">
                  Active default: {activeText.label}
                </Badge>
              ) : undefined
            }
          >
            {textConnections.length === 0 ? (
              <Text as="p" size="sm" tone="secondary">
                No text providers configured yet. Add a text provider in the
                Text Providers tab first.
              </Text>
            ) : (
              <Stack direction="column" align="stretch" gap="xs">
                <OverrideFieldRow
                  icon="Sparkles"
                  label="New Story Setup"
                  value={genProviderId}
                  options={textOptions}
                  ariaLabel="New Story Setup Provider"
                  badges={renderOverrideStatusBadge(genProviderId)}
                  onChange={(val) => {
                    void setGenerationTextProvider(val || null)
                      .then(setRegistry)
                      .catch((err) =>
                        setStatus({
                          kind: "err",
                          text:
                            err instanceof Error ? err.message : String(err),
                        }),
                      );
                  }}
                />

                <OverrideFieldRow
                  icon="BookOpen"
                  label="Close Chapter & Summary"
                  value={chapterProviderId}
                  options={textOptions}
                  ariaLabel="Close Chapter Provider"
                  badges={renderOverrideStatusBadge(chapterProviderId)}
                  onChange={(val) => {
                    void setChapterTextProvider(val || null)
                      .then(setRegistry)
                      .catch((err) =>
                        setStatus({
                          kind: "err",
                          text:
                            err instanceof Error ? err.message : String(err),
                        }),
                      );
                  }}
                />

                <OverrideFieldRow
                  icon="UserPlus"
                  label="Character Creator & NPCs"
                  value={charProviderId}
                  options={textOptions}
                  ariaLabel="Character Creator Provider"
                  badges={renderOverrideStatusBadge(charProviderId)}
                  onChange={(val) => {
                    void setCharacterTextProvider(val || null)
                      .then(setRegistry)
                      .catch((err) =>
                        setStatus({
                          kind: "err",
                          text:
                            err instanceof Error ? err.message : String(err),
                        }),
                      );
                  }}
                />

                <OverrideFieldRow
                  icon="Bot"
                  label="AI Brainstorm Assistant"
                  value={brainstormProviderId}
                  options={textOptions}
                  ariaLabel="AI Brainstorm Assistant Provider"
                  badges={renderOverrideStatusBadge(brainstormProviderId)}
                  onChange={(val) => {
                    const prev = brainstormProviderId;
                    setBrainstormProviderId(val);
                    void setBrainstormSettings({
                      textProviderId: val || null,
                    }).catch((err) => {
                      setBrainstormProviderId(prev);
                      setStatus({
                        kind: "err",
                        text:
                          err instanceof Error ? err.message : String(err),
                      });
                    });
                  }}
                />

                <OverrideFieldRow
                  icon="Tag"
                  label="AI Tagging (Playthroughs & Characters)"
                  value={tagProviderId}
                  options={textOptions}
                  ariaLabel="AI Tagging Provider"
                  badges={renderOverrideStatusBadge(tagProviderId)}
                  onChange={(val) => {
                    void setTagTextProvider(val || null)
                      .then(setRegistry)
                      .catch((err) =>
                        setStatus({
                          kind: "err",
                          text:
                            err instanceof Error ? err.message : String(err),
                        }),
                      );
                  }}
                />
              </Stack>
            )}
          </FormSection>

          <Separator spacing="xs" />

          <FormSection
            icon="Wand2"
            title="Image Prompt Writer Overrides"
            description="Choose which text connection writes scene image prompts for each configured image provider."
          >
            {imageConnections.length === 0 ? (
              <Text as="p" size="sm" tone="secondary">
                No image providers configured yet. Add an image provider in the
                Image Providers tab to configure its prompt writer.
              </Text>
            ) : (
              <Stack direction="column" align="stretch" gap="xs">
                {imageConnections.map((img) => {
                  const isActiveImg =
                    img.id === registry?.activeImageProviderId;
                  const missingWriter =
                    !!img.promptProviderId &&
                    !textConnections.some((t) => t.id === img.promptProviderId);
                  const selectedWriterId = missingWriter
                    ? ""
                    : (img.promptProviderId ?? "");
                  return (
                    <OverrideFieldRow
                      key={img.id}
                      icon="Image"
                      label={img.label}
                      value={selectedWriterId}
                      options={textOptions}
                      ariaLabel={`Image Prompt Writer for ${img.label}`}
                      badges={
                        <>
                          {isActiveImg && (
                            <Badge variant="accent" size="xs" leftIcon="Check">
                              Active
                            </Badge>
                          )}
                          {renderOverrideStatusBadge(
                            img.promptProviderId,
                            missingWriter,
                          )}
                        </>
                      }
                      onChange={(val) =>
                        void handleImagePromptWriterChange(img, val)
                      }
                    />
                  );
                })}
              </Stack>
            )}
          </FormSection>
        </Stack>
      </Card>
    </Stack>
  );
}
