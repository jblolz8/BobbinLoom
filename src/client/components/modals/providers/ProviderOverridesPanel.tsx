import { useEffect, useMemo, useState } from "react";
import { Badge, Card, FormGrid, FormSection, Icon, Separator, SimpleSelect } from "../../base";
import {
  listProviderConnections,
  setChapterTextProvider,
  setCharacterTextProvider,
  setGenerationTextProvider,
  updateProviderConnection,
  type ProviderConnection,
  type ProviderRegistry,
} from "../../../api";

export type ProviderOverridesPanelProps = {
  active?: boolean;
};

export function ProviderOverridesPanel({ active = true }: ProviderOverridesPanelProps) {
  const [registry, setRegistry] = useState<ProviderRegistry | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    listProviderConnections()
      .then(setRegistry)
      .catch((err) => setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) }));
  }, [active]);

  const textConnections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === "text"),
    [registry]
  );

  const imageConnections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === "image"),
    [registry]
  );

  const activeText = useMemo(
    () => textConnections.find((c) => c.id === registry?.activeTextProviderId),
    [textConnections, registry?.activeTextProviderId]
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
    [textConnections, activeText]
  );

  async function handleImagePromptWriterChange(img: ProviderConnection, nextProviderId: string) {
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
      setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status && <p className={`conn-status ${status.kind}`}>{status.text}</p>}

      <Card variant="elevated" padding="md" className="flex flex-col gap-3">
        <FormSection
          icon="Sliders"
          title="Text Workflow Overrides"
          description="Assign dedicated text connections to specific tasks (e.g. a reasoning model for story setup, chapter compaction, or character creation while keeping a fast model active for chat turns)."
          action={
            activeText ? (
              <Badge variant="neutral" size="xs" leftIcon={<Icon name="Zap" size={12} />}>
                Active default: {activeText.label}
              </Badge>
            ) : undefined
          }
        >
          {textConnections.length === 0 ? (
            <p className="conn-empty">
              No text providers configured yet. Add a text provider in the Text Providers tab first.
            </p>
          ) : (
            <FormGrid cols={3}>
              <SimpleSelect
                label="New Story Setup"
                labelIcon="Sparkles"
                size="sm"
                variant="filled"
                fullWidth
                value={registry?.generationTextProviderId ?? ""}
                onChange={(val) => {
                  void setGenerationTextProvider(val || null)
                    .then(setRegistry)
                    .catch((err) =>
                      setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) })
                    );
                }}
                options={textOptions}
                aria-label="New Story Setup Provider"
              />

              <SimpleSelect
                label="Close Chapter & Summary"
                labelIcon="BookOpen"
                size="sm"
                variant="filled"
                fullWidth
                value={registry?.chapterTextProviderId ?? ""}
                onChange={(val) => {
                  void setChapterTextProvider(val || null)
                    .then(setRegistry)
                    .catch((err) =>
                      setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) })
                    );
                }}
                options={textOptions}
                aria-label="Close Chapter Provider"
              />

              <SimpleSelect
                label="Character Creator & NPCs"
                labelIcon="UserPlus"
                size="sm"
                variant="filled"
                fullWidth
                value={registry?.characterTextProviderId ?? ""}
                onChange={(val) => {
                  void setCharacterTextProvider(val || null)
                    .then(setRegistry)
                    .catch((err) =>
                      setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) })
                    );
                }}
                options={textOptions}
                aria-label="Character Creator Provider"
              />
            </FormGrid>
          )}
        </FormSection>

        <Separator spacing="xs" />

        <FormSection
          icon="Wand2"
          title="Image Prompt Writer Overrides"
          description="Choose which text connection writes scene image prompts for each configured image provider."
        >
          {imageConnections.length === 0 ? (
            <p className="conn-empty">
              No image providers configured yet. Add an image provider in the Image Providers tab to configure its prompt writer.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {imageConnections.map((img) => {
                const isActiveImg = img.id === registry?.activeImageProviderId;
                const missingWriter =
                  !!img.promptProviderId && !textConnections.some((t) => t.id === img.promptProviderId);
                return (
                  <Card
                    key={img.id}
                    variant="panel"
                    padding="xs"
                    className="flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="Image" size={14} className="ds-icon-accent shrink-0" />
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {img.label}
                      </span>
                      {isActiveImg && (
                        <Badge variant="accent" size="xs">
                          Active
                        </Badge>
                      )}
                      {missingWriter && (
                        <Badge variant="warning" size="xs" leftIcon={<Icon name="AlertTriangle" size={11} />}>
                          Writer missing
                        </Badge>
                      )}
                    </div>
                    <div className="w-full sm:w-64">
                      <SimpleSelect
                        size="xs"
                        variant="filled"
                        fullWidth
                        value={missingWriter ? "" : (img.promptProviderId ?? "")}
                        onChange={(val) => void handleImagePromptWriterChange(img, val)}
                        options={textOptions}
                        aria-label={`Image Prompt Writer for ${img.label}`}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </FormSection>
      </Card>
    </div>
  );
}
