import { useEffect, useState, type Dispatch, type FormEvent, type MouseEvent, type SetStateAction } from "react";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  FormSection,
  Icon,
  SimpleSelect,
  Slider,
  TextInput,
} from "../../base";
import type {
  ConnectionTestResponseResult,
  ProviderConnection,
  ProviderConnectionPayload,
  ProviderModelCapabilities,
} from "../../../api";
import {
  DEFAULT_PROVIDER_TEST_PROMPT,
  OPTIONAL_TEXT_SAMPLER_KEYS,
  TEXT_PROVIDER_SOURCES,
  TEXT_PROVIDER_SOURCE_LIST,
  getSourceParamSpec,
  isBuiltInCloudBaseUrl,
  isParamSupportedBySource,
  resolveTextProviderSource,
  type OptionalTextSamplerKey,
  type TextJsonMode,
  type TextProviderSource,
} from "../../../../schemas";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";
import { EditorActionBar, type EditorFooterStatus } from "./EditorActionBar";

type EditorStatus = { kind: "ok" | "err" | "warn"; text: string; detail?: string } | null;

function optionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function timeoutSecondsToMs(raw: string): number | null {
  const seconds = optionalNumber(raw);
  return seconds === undefined ? null : Math.max(1, Math.round(seconds)) * 1000;
}

function formatStopSequences(stop?: string[] | null): string {
  if (!stop || stop.length === 0) return "";
  return stop.map((s) => s.replace(/\n/g, "\\n")).join(", ");
}

function parseStopSequences(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim().replace(/\\n/g, "\n"))
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

const SOURCE_OPTIONS = TEXT_PROVIDER_SOURCE_LIST.map((src) => ({
  value: src.id,
  label: src.label,
  icon: <Icon name="Globe" size={12} />,
}));

export type TextConnectionEditorProps = {
  mode: "create" | "edit";
  /** The connection being edited (null while creating). */
  editing: ProviderConnection | null;
  form: ProviderConnectionPayload;
  setForm: Dispatch<SetStateAction<ProviderConnectionPayload>>;
  apiKey: ApiKeyFieldProps;
  /** Models from the last probe, with its status and per-model capabilities. */
  models: string[];
  modelSpecs?: ProviderModelCapabilities;
  modelsStatus: EditorStatus;
  fetchingModels: boolean;
  onFetchModels: () => void;
  testStatus: EditorFooterStatus;
  onDismissStatus?: () => void;
  testingConnection?: boolean;
  testingResponse?: boolean;
  testDrawerOpen?: boolean;
  onToggleTestDrawer?: () => void;
  testPrompt?: string;
  onTestPromptChange?: (nextPrompt: string) => void;
  onSaveTestPrompt?: (promptToSave: string) => void;
  testResponseResult?: ConnectionTestResponseResult | null;
  onClearTestResponse?: () => void;
  busy: boolean;
  /** The form differs from what was loaded/saved. Gates Save in EDIT mode: a
   *  create form is seeded from its own baseline, so gating that too would make a
   *  new connection unsaveable. */
  dirty: boolean;
  onSubmit: (e: FormEvent) => void;
  onTest: (e: MouseEvent) => void;
  onTestResponse?: (e: MouseEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export function TextConnectionEditor({
  mode,
  editing,
  form,
  setForm,
  apiKey,
  models,
  modelSpecs = {},
  modelsStatus,
  fetchingModels,
  onFetchModels,
  testStatus,
  onDismissStatus,
  testingConnection = false,
  testingResponse = false,
  testDrawerOpen = false,
  onToggleTestDrawer,
  testPrompt = DEFAULT_PROVIDER_TEST_PROMPT,
  onTestPromptChange,
  onSaveTestPrompt,
  testResponseResult = null,
  onClearTestResponse,
  busy,
  dirty,
  onSubmit,
  onTest,
  onTestResponse,
  onCancel,
  onDelete,
}: TextConnectionEditorProps) {
  const [stopDraft, setStopDraft] = useState(() => formatStopSequences(form.stop));

  const currentSource: TextProviderSource = resolveTextProviderSource(form.textSource, form.baseUrl);
  const sourceSpec = TEXT_PROVIDER_SOURCES[currentSource];
  const tempSpec = getSourceParamSpec(currentSource, "temperature");

  const supportedOptionalSamplers = OPTIONAL_TEXT_SAMPLER_KEYS.filter((key) =>
    isParamSupportedBySource(currentSource, key)
  );

  const activeSamplerCount = supportedOptionalSamplers.filter((key) => form[key] != null).length;

  const selectedModelCaps = form.model ? modelSpecs[form.model] : undefined;
  const reportedContextLength = selectedModelCaps?.contextLength;
  const reportedMaxOutput = selectedModelCaps?.maxCompletionTokens;

  useEffect(() => {
    setStopDraft(formatStopSequences(form.stop));
  }, [editing?.id, mode]);

  function handleSourceChange(nextSource: TextProviderSource) {
    const nextSpec = TEXT_PROVIDER_SOURCES[nextSource];
    setForm((prev) => {
      const next: ProviderConnectionPayload = {
        ...prev,
        textSource: nextSource,
      };
      // Auto-fill the Base URL when switching to a cloud source if the field is empty
      // or currently holds one of the built-in cloud URLs, while keeping custom URLs intact.
      if (isBuiltInCloudBaseUrl(prev.baseUrl)) {
        next.baseUrl = nextSpec.defaultBaseUrl;
      }
      // Clamp temperature if the new source has a stricter ceiling (e.g. Moonshot AI 0–1).
      const nextTempSpec = getSourceParamSpec(nextSource, "temperature");
      if (typeof next.temperature === "number" && next.temperature > nextTempSpec.max) {
        next.temperature = nextTempSpec.max;
      }
      return next;
    });
  }

  function handleSamplerChange(key: OptionalTextSamplerKey, nextVal: number | null | undefined) {
    setForm((prev) => ({
      ...prev,
      [key]: nextVal === undefined ? null : nextVal,
    }));
  }

  const showResetBaseUrl =
    Boolean(sourceSpec.defaultBaseUrl) &&
    form.baseUrl.trim().replace(/\/+$/, "") !== sourceSpec.defaultBaseUrl.replace(/\/+$/, "");

  const isDrawerVisible = testDrawerOpen || Boolean(testResponseResult) || testingResponse;
  const isPromptModified = testPrompt.trim() !== DEFAULT_PROVIDER_TEST_PROMPT;

  return (
    <Card as="form" variant="elevated" padding="md" className="conn-editor" onSubmit={onSubmit}>
      <div className="conn-editor-header">
        <h4>{mode === "create" ? "New Text Provider Connection" : `Edit: ${editing?.label ?? ""}`}</h4>
      </div>

      <FormSection icon="Plug" title="Chat Completion Source & Connection">
        <SimpleSelect<TextProviderSource>
          label="Chat Completion Source"
          size="sm"
          variant="filled"
          fullWidth
          value={currentSource}
          onChange={handleSourceChange}
          options={SOURCE_OPTIONS}
          aria-label="Chat Completion Source"
          helperText={sourceSpec.description}
        />

        <FormGrid cols="2-asymmetric">
          <TextInput
            label="Connection Name"
            size="sm"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder={`e.g. ${sourceSpec.label}`}
          />

          <TextInput
            label="Base URL"
            size="sm"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder={sourceSpec.baseUrlPlaceholder}
            leftIcon={<Icon name="Globe" size={13} />}
            rightElement={
              showResetBaseUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  leftIcon="RotateCcw"
                  onClick={() => setForm((f) => ({ ...f, baseUrl: sourceSpec.defaultBaseUrl }))}
                  title={`Reset to default ${sourceSpec.label} URL (${sourceSpec.defaultBaseUrl})`}
                >
                  Default
                </Button>
              ) : undefined
            }
          />
        </FormGrid>

        <FormGrid cols="2-asymmetric">
          <ApiKeyField {...apiKey} />

          <div className="flex flex-col gap-1 min-w-0">
            <TextInput
              label="Model ID"
              size="sm"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder={sourceSpec.modelPlaceholder}
              leftIcon={<Icon name="Cpu" size={13} />}
              rightElement={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onFetchModels}
                  disabled={fetchingModels || busy || (mode !== "edit" && !form.baseUrl.trim())}
                  isLoading={fetchingModels}
                  leftIcon={<Icon name="RefreshCw" size={12} className={fetchingModels ? "animate-spin" : ""} />}
                >
                  Fetch
                </Button>
              }
            />
            {models.length > 0 && (
              <SimpleSelect
                size="xs"
                variant="filled"
                fullWidth
                value={models.includes(form.model) ? form.model : ""}
                onChange={(selectedModel) => {
                  if (selectedModel) {
                    const caps = modelSpecs[selectedModel];
                    setForm((f) => ({
                      ...f,
                      model: selectedModel,
                      ...(caps?.contextLength && (f.contextWindow === undefined || f.contextWindow === 32768)
                        ? { contextWindow: caps.contextLength }
                        : {}),
                    }));
                  }
                }}
                placeholder={`Select fetched model (${models.length})…`}
                options={models.map((m) => {
                  const caps = modelSpecs[m];
                  const ctxLabel = caps?.contextLength
                    ? ` (${Math.round(caps.contextLength / 1024)}k ctx)`
                    : "";
                  return {
                    value: m,
                    label: `${m}${ctxLabel}`,
                    icon: <Icon name="Cpu" size={12} />,
                  };
                })}
              />
            )}
            {modelsStatus && (
              <div className={`conn-inline-status ${modelsStatus.kind}`}>
                <Icon
                  name={
                    modelsStatus.kind === "ok"
                      ? "CheckCircle2"
                      : modelsStatus.kind === "warn"
                        ? "AlertTriangle"
                        : "AlertCircle"
                  }
                  size={12}
                />
                <span>{modelsStatus.text}</span>
              </div>
            )}
          </div>
        </FormGrid>
      </FormSection>

      <FormSection icon="Sliders" title="Context, Output & Format">
        <FormGrid cols={3}>
          <div className="flex flex-col gap-1 min-w-0">
            <TextInput
              label="Max Response Tokens"
              size="sm"
              type="number"
              min={1}
              placeholder="1200"
              value={form.maxTokens === undefined || form.maxTokens === null ? "" : String(form.maxTokens)}
              onChange={(e) => setForm((f) => ({ ...f, maxTokens: optionalNumber(e.target.value) }))}
            />
            {reportedMaxOutput && (
              <button
                type="button"
                className="conn-limit-chip"
                onClick={() => setForm((f) => ({ ...f, maxTokens: reportedMaxOutput }))}
                title="Click to apply the model's reported maximum completion tokens"
              >
                Model max output: <strong>{reportedMaxOutput.toLocaleString()}</strong>
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <TextInput
              label="Context Window"
              size="sm"
              type="number"
              min={512}
              placeholder="32768"
              value={form.contextWindow === undefined || form.contextWindow === null ? "" : String(form.contextWindow)}
              onChange={(e) => setForm((f) => ({ ...f, contextWindow: optionalNumber(e.target.value) }))}
            />
            {reportedContextLength && (
              <button
                type="button"
                className="conn-limit-chip"
                onClick={() => setForm((f) => ({ ...f, contextWindow: reportedContextLength }))}
                title="Click to apply the model's reported context window"
              >
                Model max context: <strong>{reportedContextLength.toLocaleString()}</strong>
              </button>
            )}
          </div>
          <TextInput
            label="Timeout (s)"
            size="sm"
            type="number"
            min={1}
            step={1}
            placeholder="120"
            leftIcon={<Icon name="Timer" size={13} />}
            value={
              form.timeoutMs === undefined || form.timeoutMs === null
                ? ""
                : String(Math.round(form.timeoutMs / 1000))
            }
            onChange={(e) => setForm((f) => ({ ...f, timeoutMs: timeoutSecondsToMs(e.target.value) }))}
          />
        </FormGrid>

        <FormGrid cols="2-asymmetric">
          <SimpleSelect
            label="JSON Response Mode"
            size="sm"
            variant="filled"
            fullWidth
            value={form.jsonMode === "off" ? "off" : "auto"}
            onChange={(val) => {
              const nextMode: TextJsonMode | null = val === "off" ? "off" : null;
              setForm((f) => ({ ...f, jsonMode: nextMode }));
            }}
            options={[
              {
                value: "auto",
                label: "Auto (json_object)",
                icon: <Icon name="Braces" size={12} />,
              },
              {
                value: "off",
                label: "Off — Prompt-only (GGUF / Reasoning)",
                icon: <Icon name="FileText" size={12} />,
              },
            ]}
          />

          <TextInput
            label="Stop Sequences (comma-separated)"
            size="sm"
            value={stopDraft}
            onChange={(e) => {
              const raw = e.target.value;
              setStopDraft(raw);
              setForm((f) => ({ ...f, stop: parseStopSequences(raw) }));
            }}
            placeholder="e.g. \nUser:, \nPlayer:"
          />
        </FormGrid>
      </FormSection>

      <FormSection
        icon="Sparkles"
        title={`Sampling & Penalties (${sourceSpec.shortLabel})`}
        badge={
          activeSamplerCount > 0 ? (
            <Badge variant="accent" size="xs" pill>
              {activeSamplerCount} custom
            </Badge>
          ) : undefined
        }
      >
        <FormGrid cols={2} gap="xs">
          <Slider
            label={tempSpec.label}
            rangeHint={tempSpec.rangeHint}
            description={tempSpec.description}
            min={tempSpec.min}
            max={tempSpec.max}
            step={tempSpec.step}
            defaultPreview={tempSpec.defaultPreview}
            value={form.temperature}
            onChange={(val) =>
              setForm((f) => ({
                ...f,
                temperature: val === null || val === undefined ? undefined : val,
              }))
            }
          />

          {supportedOptionalSamplers.map((paramKey) => {
            const spec = getSourceParamSpec(currentSource, paramKey);
            return (
              <Slider
                key={paramKey}
                label={spec.label}
                rangeHint={spec.rangeHint}
                description={spec.description}
                min={spec.min}
                max={spec.max}
                sliderMax={spec.sliderMax}
                step={spec.step}
                defaultPreview={spec.defaultPreview}
                integer={spec.integer}
                clearable
                clearedValue={null}
                value={form[paramKey]}
                onChange={(val) => handleSamplerChange(paramKey, val)}
              />
            );
          })}
        </FormGrid>
      </FormSection>

      <EditorActionBar
        mode={mode}
        busy={busy}
        dirty={dirty}
        testingConnection={testingConnection}
        testingResponse={testingResponse}
        testDrawerOpen={isDrawerVisible}
        drawerContent={
          isDrawerVisible ? (
            <div className="conn-test-drawer">
              <div className="conn-test-drawer__header">
                <div className="conn-test-drawer__title">
                  <Icon name="MessageSquare" size={13} className="ds-icon-accent" />
                  <span>Test Response Prompt</span>
                  <Badge variant="neutral" size="xs">
                    Global
                  </Badge>
                </div>
                <div className="conn-test-drawer__actions">
                  {isPromptModified && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      leftIcon="RotateCcw"
                      onClick={() => {
                        onTestPromptChange?.(DEFAULT_PROVIDER_TEST_PROMPT);
                        onSaveTestPrompt?.(DEFAULT_PROVIDER_TEST_PROMPT);
                      }}
                      title="Reset to default global test prompt"
                    >
                      Reset
                    </Button>
                  )}
                  <button
                    type="button"
                    className="conn-test-drawer__close"
                    onClick={() => {
                      onClearTestResponse?.();
                      if (testDrawerOpen) onToggleTestDrawer?.();
                    }}
                    aria-label="Close test prompt drawer"
                    title="Close"
                  >
                    <Icon name="X" size={13} />
                  </button>
                </div>
              </div>

              <div className="conn-test-drawer__prompt-row">
                <TextInput
                  size="sm"
                  fullWidth
                  value={testPrompt}
                  onChange={(e) => onTestPromptChange?.(e.target.value)}
                  onBlur={() => onSaveTestPrompt?.(testPrompt)}
                  placeholder={DEFAULT_PROVIDER_TEST_PROMPT}
                  aria-label="Global test prompt"
                />
                {onTestResponse && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon="Send"
                    isLoading={testingResponse}
                    disabled={busy || testingConnection || testingResponse}
                    onClick={onTestResponse}
                  >
                    Send
                  </Button>
                )}
              </div>

              {(testingResponse || testResponseResult) && (
                <div
                  className={`conn-test-reply ${
                    testingResponse
                      ? "loading"
                      : testResponseResult?.ok
                        ? "ok"
                        : "err"
                  }`}
                >
                  {testingResponse ? (
                    <div className="conn-test-reply__loading">
                      <Icon name="Loader2" size={13} className="animate-spin" />
                      <span>Waiting for model completion…</span>
                    </div>
                  ) : (
                    testResponseResult && (
                      <>
                        <div className="conn-test-reply__meta">
                          <Badge
                            variant={testResponseResult.ok ? "success" : "danger"}
                            size="xs"
                            leftIcon={testResponseResult.ok ? "CheckCircle2" : "AlertCircle"}
                          >
                            {testResponseResult.ok
                              ? "Reply"
                              : `Failed${testResponseResult.status ? ` (${testResponseResult.status})` : ""}`}
                          </Badge>
                          {typeof testResponseResult.latencyMs === "number" && (
                            <Badge variant="neutral" size="xs" leftIcon="Timer">
                              {testResponseResult.latencyMs}ms
                            </Badge>
                          )}
                          {testResponseResult.model && (
                            <Badge variant="outline" size="xs" leftIcon="Cpu">
                              {testResponseResult.model}
                            </Badge>
                          )}
                          {testResponseResult.usage &&
                            (testResponseResult.usage.promptTokens !== undefined ||
                              testResponseResult.usage.completionTokens !== undefined) && (
                              <Badge variant="neutral" size="xs" leftIcon="Hash">
                                {testResponseResult.usage.promptTokens ?? "?"} in ·{" "}
                                {testResponseResult.usage.completionTokens ?? "?"} out
                              </Badge>
                            )}
                        </div>
                        <div className="conn-test-reply__body">
                          {testResponseResult.ok
                            ? testResponseResult.reply || "(Empty response)"
                            : testResponseResult.message || "Request failed."}
                        </div>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          ) : undefined
        }
        status={testStatus}
        onDismissStatus={onDismissStatus}
        onTest={onTest}
        onTestResponse={onTestResponse}
        onToggleTestDrawer={onToggleTestDrawer}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </Card>
  );
}
