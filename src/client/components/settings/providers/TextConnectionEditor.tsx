import {
  type Dispatch,
  type FormEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  FormSection,
  Header,
  Icon,
  SimpleSelect,
  Slider,
  Stack,
  StatusMessage,
  Text,
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

type EditorStatus = {
  kind: "ok" | "err" | "warn";
  text: string;
  detail?: string;
} | null;

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
  const currentSource: TextProviderSource = resolveTextProviderSource(
    form.textSource,
    form.baseUrl,
  );
  const sourceSpec = TEXT_PROVIDER_SOURCES[currentSource];
  const tempSpec = getSourceParamSpec(currentSource, "temperature");

  const supportedOptionalSamplers = OPTIONAL_TEXT_SAMPLER_KEYS.filter((key) =>
    isParamSupportedBySource(currentSource, key),
  );

  const activeSamplerCount = supportedOptionalSamplers.filter(
    (key) => form[key] != null,
  ).length;

  const selectedModelCaps = form.model ? modelSpecs[form.model] : undefined;
  const reportedContextLength = selectedModelCaps?.contextLength;
  const reportedMaxOutput = selectedModelCaps?.maxCompletionTokens;

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
      if (
        typeof next.temperature === "number" &&
        next.temperature > nextTempSpec.max
      ) {
        next.temperature = nextTempSpec.max;
      }
      return next;
    });
  }

  function handleSamplerChange(
    key: OptionalTextSamplerKey,
    nextVal: number | null | undefined,
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: nextVal === undefined ? null : nextVal,
    }));
  }

  const showResetBaseUrl =
    Boolean(sourceSpec.defaultBaseUrl) &&
    form.baseUrl.trim().replace(/\/+$/, "") !==
      sourceSpec.defaultBaseUrl.replace(/\/+$/, "");

  const isDrawerVisible =
    testDrawerOpen || Boolean(testResponseResult) || testingResponse;
  const isPromptModified = testPrompt.trim() !== DEFAULT_PROVIDER_TEST_PROMPT;

  return (
    <Card as="form" variant="elevated" padding="md" onSubmit={onSubmit}>
      <Stack direction="column" align="stretch" gap="sm">
        <Header
          variant="panel"
          bordered
          title={
            mode === "create"
              ? "New Text Provider Connection"
              : `Edit: ${editing?.label ?? ""}`
          }
        />

        <FormSection icon="Plug" title="Chat Completion Source & Connection">
          <Stack direction="column" align="stretch" gap="xs">
            <SimpleSelect<TextProviderSource>
              label="Chat Completion Source"
              tooltip={sourceSpec.description}
              size="sm"
              variant="filled"
              fullWidth
              value={currentSource}
              onChange={handleSourceChange}
              options={SOURCE_OPTIONS}
              aria-label="Chat Completion Source"
              helperText={sourceSpec.description}
            />

            <TextInput
              label="Connection Name"
              tooltip="A friendly display name to identify this connection in your provider list."
              size="sm"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder={`e.g. ${sourceSpec.label}`}
            />

            <TextInput
              label="Base URL"
              tooltip="The root OpenAI-compatible API endpoint (e.g. https://openrouter.ai/api/v1 or http://localhost:1234/v1)."
              size="sm"
              value={form.baseUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, baseUrl: e.target.value }))
              }
              placeholder={sourceSpec.baseUrlPlaceholder}
              leftIcon={<Icon name="Globe" size={13} />}
              rightElement={
                showResetBaseUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon="RotateCcw"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        baseUrl: sourceSpec.defaultBaseUrl,
                      }))
                    }
                    title={`Reset to default ${sourceSpec.label} URL (${sourceSpec.defaultBaseUrl})`}
                  >
                    Default
                  </Button>
                ) : undefined
              }
            />

            <ApiKeyField {...apiKey} />

            <Stack direction="column" align="stretch" gap="2xs">
              <TextInput
                label="Model ID"
                tooltip="The model identifier sent in chat completion requests. Click Fetch to query available models from the server."
                size="sm"
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
                placeholder={sourceSpec.modelPlaceholder}
                leftIcon={<Icon name="Cpu" size={13} />}
                rightElement={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onFetchModels}
                    disabled={
                      fetchingModels ||
                      busy ||
                      (mode !== "edit" && !form.baseUrl.trim())
                    }
                    isLoading={fetchingModels}
                    leftIcon="RefreshCw"
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
                      setForm((f) => ({
                        ...f,
                        model: selectedModel,
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
                <StatusMessage variant="inline" tone={modelsStatus.kind}>
                  {modelsStatus.text}
                </StatusMessage>
              )}
            </Stack>
          </Stack>
        </FormSection>

        <FormSection icon="Sliders" title="Context, Output & Format">
          <FormGrid cols={2} gap="xs">
            <Slider
              label="Context Window"
              rangeHint="tokens"
              description="Total token budget for prompt assembly (system modules, lorebooks, character state, and chat history). Defaults to 32,768 tokens."
              min={2048}
              max={2000000}
              sliderMax={
                reportedContextLength
                  ? Math.max(65536, reportedContextLength)
                  : 131072
              }
              step={1024}
              defaultPreview={32768}
              integer
              value={form.contextWindow}
              onChange={(val) =>
                setForm((f) => ({
                  ...f,
                  contextWindow:
                    val === null || val === undefined ? undefined : val,
                }))
              }
              headerExtra={
                reportedContextLength ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        contextWindow: reportedContextLength,
                      }))
                    }
                    title="Click to apply the model's reported context window"
                  >
                    Model max context:{" "}
                    <strong>{reportedContextLength.toLocaleString()}</strong>
                  </Button>
                ) : undefined
              }
            />

            <Slider
              label="Max Response Tokens"
              rangeHint="tokens"
              description="Maximum tokens reserved for the assistant's completion on each turn. Defaults to 1,200 tokens."
              min={128}
              max={131072}
              sliderMax={
                reportedMaxOutput ? Math.max(4096, reportedMaxOutput) : 8192
              }
              step={64}
              defaultPreview={1200}
              integer
              value={form.maxTokens}
              onChange={(val) =>
                setForm((f) => ({
                  ...f,
                  maxTokens:
                    val === null || val === undefined ? undefined : val,
                }))
              }
              headerExtra={
                reportedMaxOutput ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      setForm((f) => ({ ...f, maxTokens: reportedMaxOutput }))
                    }
                    title="Click to apply the model's reported maximum completion tokens"
                  >
                    Model max output:{" "}
                    <strong>{reportedMaxOutput.toLocaleString()}</strong>
                  </Button>
                ) : undefined
              }
            />
          </FormGrid>

          <SimpleSelect
            label="JSON Response Mode"
            tooltip="Controls whether requests include response_format: { type: 'json_object' }. Keep on Auto for standard APIs; switch to Off for local GGUF or reasoning models that reject json_object."
            size="sm"
            variant="filled"
            fullWidth
            value={form.jsonMode === "off" ? "off" : "auto"}
            onChange={(val) => {
              const nextMode: TextJsonMode | null =
                val === "off" ? "off" : null;
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
                  temperature:
                    val === null || val === undefined ? undefined : val,
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
              <Card variant="panel" padding="xs">
                <Stack direction="column" align="stretch" gap="xs">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                  >
                    <Stack direction="row" align="center" gap="2xs">
                      <Icon
                        name="MessageSquare"
                        size={13}
                        className="ds-icon-accent"
                      />
                      <Text
                        as="span"
                        size="xs"
                        weight="semibold"
                        tone="primary"
                      >
                        Test Response Prompt
                      </Text>
                      <Badge variant="neutral" size="xs">
                        Global
                      </Badge>
                    </Stack>
                    <Stack direction="row" align="center" gap="2xs">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        leftIcon="X"
                        onClick={() => {
                          onClearTestResponse?.();
                          if (testDrawerOpen) onToggleTestDrawer?.();
                        }}
                        aria-label="Close test prompt drawer"
                        title="Close"
                      />
                    </Stack>
                  </Stack>

                  <TextInput
                    size="sm"
                    fullWidth
                    value={testPrompt}
                    onChange={(e) => onTestPromptChange?.(e.target.value)}
                    onBlur={() => onSaveTestPrompt?.(testPrompt)}
                    placeholder={DEFAULT_PROVIDER_TEST_PROMPT}
                    aria-label="Global test prompt"
                    rightElement={
                      onTestResponse ? (
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
                      ) : undefined
                    }
                  />

                  {(testingResponse || testResponseResult) && (
                    <Card variant="elevated" padding="xs">
                      {testingResponse ? (
                        <StatusMessage variant="inline" loading>
                          Waiting for model completion…
                        </StatusMessage>
                      ) : (
                        testResponseResult && (
                          <Stack direction="column" align="stretch" gap="2xs">
                            <Stack
                              direction="row"
                              align="center"
                              gap="2xs"
                              wrap
                            >
                              <Badge
                                variant={
                                  testResponseResult.ok ? "success" : "danger"
                                }
                                size="xs"
                                leftIcon={
                                  testResponseResult.ok
                                    ? "CheckCircle2"
                                    : "AlertCircle"
                                }
                              >
                                {testResponseResult.ok
                                  ? "Reply"
                                  : `Failed${testResponseResult.status ? ` (${testResponseResult.status})` : ""}`}
                              </Badge>
                              {typeof testResponseResult.latencyMs ===
                                "number" && (
                                <Badge
                                  variant="neutral"
                                  size="xs"
                                  leftIcon="Timer"
                                >
                                  {testResponseResult.latencyMs}ms
                                </Badge>
                              )}
                              {testResponseResult.model && (
                                <Badge
                                  variant="outline"
                                  size="xs"
                                  leftIcon="Cpu"
                                >
                                  {testResponseResult.model}
                                </Badge>
                              )}
                              {testResponseResult.usage &&
                                (testResponseResult.usage.promptTokens !==
                                  undefined ||
                                  testResponseResult.usage.completionTokens !==
                                    undefined) && (
                                  <Badge
                                    variant="neutral"
                                    size="xs"
                                    leftIcon="Hash"
                                  >
                                    {testResponseResult.usage.promptTokens ??
                                      "?"}{" "}
                                    in ·{" "}
                                    {testResponseResult.usage
                                      .completionTokens ?? "?"}{" "}
                                    out
                                  </Badge>
                                )}
                            </Stack>
                            <Text
                              as="div"
                              size="xs"
                              leading="snug"
                              preWrap
                              tone={testResponseResult.ok ? "primary" : "danger"}
                            >
                              {testResponseResult.ok
                                ? testResponseResult.reply || "(Empty response)"
                                : testResponseResult.message ||
                                  "Request failed."}
                            </Text>
                          </Stack>
                        )
                      )}
                    </Card>
                  )}
                </Stack>
              </Card>
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
      </Stack>
    </Card>
  );
}
