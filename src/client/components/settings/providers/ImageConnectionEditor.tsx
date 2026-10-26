import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import {
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
  SwitchRow,
  Text,
  TextInput,
} from "../../base";
import type { ImageApiStyle, RegionDirection } from "../../../../schemas";
import { fetchProviderImageStyles } from "../../../api";
import type {
  ModelCapabilities,
  ProviderConnection,
  ProviderConnectionPayload,
  ProviderModelCapabilities,
} from "../../../api";
import {
  CUSTOM_STYLE_OPTION,
  imageStyleDisplay,
} from "../../../utils/imageStyleOptions";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";
import { EditorActionBar, type EditorFooterStatus } from "./EditorActionBar";

type EditorStatus = EditorFooterStatus;

const API_STYLE_OPTIONS: Array<{ value: ImageApiStyle; label: string }> = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "venice", label: "Venice" },
  { value: "a1111", label: "Automatic1111 / Forge (local)" },
];

/** Forge Couple ‘direction’, in the extension’s own spelling: Horizontal
 *  maps left→right, Vertical top→bottom, and the value goes on the wire
 *  verbatim. The labels spell out the geometry because the words alone do not
 *  say which way the blocks run. */
const REGION_DIRECTION_OPTIONS: Array<{
  value: RegionDirection;
  label: string;
}> = [
  { value: "Horizontal", label: "Horizontal — left to right" },
  { value: "Vertical", label: "Vertical — top to bottom" },
];

/** A numeric field's raw text as a number, or `undefined` when the field is
 *  empty or not a number — which is how "send nothing and let the server
 *  default apply" is expressed. Never 0: an empty field must not become a real
 *  value (that is what the negative branch on Step/Range does upstream). */
function optionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** The timeout field in SECONDS, stored as `timeoutMs`. Anything below a
 *  second is meaningless (and below the schema's 1000 ms floor), so it clamps
 *  to 1 s rather than round-tripping to an invalid stored value. */
function timeoutSecondsToMs(raw: string): number | undefined {
  const seconds = optionalNumber(raw);
  return seconds === undefined
    ? undefined
    : Math.max(1, Math.round(seconds)) * 1000;
}

/** The Style Preset select's fetched list plus its status line. One state so the
 *  two can never disagree about whether the list is known. */
type StyleListState = { styles: string[]; status: EditorStatus };

/**
 * Session cache of the provider's image style list, keyed by normalized base
 * URL. The list belongs to the PROVIDER, not to a connection, and the editor
 * remounts on every open — so without this a re-opened connection re-fetched
 * (and re-flashed the Style Preset field) every single time. Seeded into state
 * on mount so the first paint is already correct; the explicit refresh control
 * still forces a fetch.
 */
const imageStyleCache = new Map<string, string[]>();

function normalizeStyleBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").toLowerCase();
}

function readCachedStyles(cacheKey: string | null): string[] | null {
  if (!cacheKey) return null;
  const cached = imageStyleCache.get(cacheKey);
  // An EMPTY cached list is not cached state: empty means "not fetched", and
  // caching that would permanently suppress the fetch.
  return cached && cached.length ? cached : null;
}

function stylesLoadedStatus(styles: string[]): EditorStatus {
  return {
    kind: "ok",
    text: `${styles.length} style${styles.length === 1 ? "" : "s"} loaded.`,
  };
}

/** OpenAI's image size enum; "auto" lets the provider pick. */
const IMAGE_SIZE_OPTIONS = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1024x1792",
  "1792x1024",
];

const VARIANT_OPTIONS = ["1", "2", "3", "4"];

/**
 * The read-only capability lines for one model's provider-published spec. [] for
 * a model the listing did not describe — a convenience block, never an error.
 *
 * Centered on the SIZING parameter on purpose: `aspect_ratio` and
 * `width`/`height` are mutually exclusive upstream, so a model takes one and
 * ignores the other. That is exactly the confusion this block removes.
 */
function capabilityLines(caps: ModelCapabilities | undefined): string[] {
  if (!caps) return [];
  const lines: string[] = [];

  if (caps.promptCharacterLimit !== undefined) {
    lines.push(`Prompt limit: ${caps.promptCharacterLimit} characters.`);
  }

  if (caps.steps) {
    const parts: string[] = [];
    if (caps.steps.default !== undefined)
      parts.push(`${caps.steps.default} default`);
    if (caps.steps.max !== undefined) parts.push(`up to ${caps.steps.max}`);
    if (parts.length) lines.push(`Steps: ${parts.join(", ")}.`);
  }

  const ratios = caps.aspectRatios?.length ? caps.aspectRatios.join(", ") : "";
  const defaultRatio = caps.defaultAspectRatio
    ? ` (default ${caps.defaultAspectRatio})`
    : "";
  const divisor = caps.widthHeightDivisor;
  if (divisor !== undefined && ratios) {
    lines.push(
      `Sizing: width/height in multiples of ${divisor}, or aspect_ratio from ${ratios}${defaultRatio}.`,
    );
  } else if (divisor !== undefined) {
    lines.push(
      `Sizing: this model takes width/height, in multiples of ${divisor}.`,
    );
  } else if (ratios) {
    lines.push(
      `Sizing: this model takes aspect_ratio, one of ${ratios}${defaultRatio} — it does not take width/height, so set Aspect Ratio above (Image Size is then not sent).`,
    );
  }

  if (caps.resolutions?.length) {
    lines.push(`Resolutions: ${caps.resolutions.join(", ")}.`);
  }

  return lines;
}

/**
 * The a1111 counterpart of `capabilityLines`: the WebUI publishes no
 * `model_spec.constraints`, so there is nothing per-model to report. What it
 * DOES tell us — through the same probe — is how many checkpoints it lists and
 * how many samplers/schedulers it accepts, and that is what this block shows
 * instead of an empty (and therefore invisible) OpenAI block.
 */
function dialectCapabilityLines(counts: {
  checkpoints: number;
  samplers: number;
  schedulers: number;
}): string[] {
  const lines: string[] = [];
  lines.push(
    counts.checkpoints > 0
      ? `${counts.checkpoints} checkpoint${counts.checkpoints === 1 ? "" : "s"} listed by the WebUI.`
      : "No checkpoints listed yet — Fetch models reads the WebUI's own list.",
  );
  lines.push(
    counts.samplers > 0 || counts.schedulers > 0
      ? `${counts.samplers} samplers and ${counts.schedulers} schedulers listed by the WebUI — they fill the Sampler and Scheduler pickers below.`
      : "The WebUI did not list its samplers/schedulers (an older build has no such route) — the names are free text, so type exactly what your build accepts.",
  );
  lines.push(
    "Steps, CFG scale, sampler and scheduler are sent per request; an empty field is not sent at all, so the WebUI's own default applies.",
  );
  return lines;
}

export type ImageConnectionEditorProps = {
  mode: "create" | "edit";
  editing: ProviderConnection | null;
  form: ProviderConnectionPayload;
  setForm: Dispatch<SetStateAction<ProviderConnectionPayload>>;
  apiKey: ApiKeyFieldProps;
  models: string[];
  /** Per-model capabilities from the provider's own listing, keyed by model id.
   *  Read-only; a model the listing did not describe simply has no entry. */
  modelSpecs: ProviderModelCapabilities;
  /** a1111 only: the WebUI's own sampler and scheduler names, from the same
   *  probe response that filled `models`. Offered as a datalist so a fork's
   *  custom sampler can still be typed verbatim. */
  dialectOptions?: {
    samplers?: string[];
    schedulers?: string[];
    forgeCouple?: boolean;
  };
  modelsStatus: EditorStatus;
  fetchingModels: boolean;
  onFetchModels: () => void;
  testStatus: EditorStatus;
  onDismissStatus?: () => void;
  testingConnection?: boolean;
  busy: boolean;
  /** The form differs from what was loaded/saved. Gates Save in EDIT mode: a
   *  create form is seeded from its own baseline, so gating that too would make a
   *  new connection unsaveable. */
  dirty: boolean;
  onSubmit: (e: FormEvent) => void;
  onTest: (e: MouseEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Text connections available as the Prompt Writer override. */
  textConnections: ProviderConnection[];
};

/**
 * The image connection form: Basics (with API style), Model, Image Settings,
 * and Prompt Writer. Splitting it from the text editor removes the 170 lines of
 * `{kind === "image" ? … : …}` branches that were hiding inside one JSX tree.
 *
 * Notice that Temperature / Max Tokens / Context Window are NOT rendered here —
 * those belong on the text connection that writes the prompt, and the schema's
 * required defaults travel on the payload without a UI control.
 */
export function ImageConnectionEditor({
  mode,
  editing,
  form,
  setForm,
  apiKey,
  models,
  modelSpecs,
  dialectOptions,
  modelsStatus,
  fetchingModels,
  onFetchModels,
  testStatus,
  onDismissStatus,
  testingConnection = false,
  busy,
  dirty,
  onSubmit,
  onTest,
  onCancel,
  onDelete,
  textConnections,
}: ImageConnectionEditorProps) {
  // A custom size typed into providers.json by hand stays selectable instead of
  // silently reading as "nothing selected".
  const sizeOptions =
    form.size && !IMAGE_SIZE_OPTIONS.includes(form.size)
      ? [...IMAGE_SIZE_OPTIONS, form.size]
      : IMAGE_SIZE_OPTIONS;

  // "" is the "follow the active text provider" slot (the server stores it as
  // null). A dangling id stays visible so it can be re-pointed, rather than
  // showing an empty select.
  const promptWriterOptions = [
    { value: "", label: "Current active text provider" },
    ...textConnections.map((c) => ({ value: c.id, label: c.label })),
  ];
  const promptWriterId = form.promptProviderId ?? "";
  if (promptWriterId && !textConnections.some((c) => c.id === promptWriterId)) {
    promptWriterOptions.push({
      value: promptWriterId,
      label: `${promptWriterId} (not found)`,
    });
  }

  // ── Style Preset ──
  // The valid values belong to the PROVIDER, not to the user. This control used
  // to be free text whose placeholder read `e.g. anime`, and Venice rejects
  // that: its values are title-cased (`Anime`) and the field is case-sensitive.
  // The 400 lands after the text model has already written (and been paid for)
  // the prompt, which is why the list is now fetched and the field is a select.
  const apiStyle = form.apiStyle ?? "openai";
  const venice = apiStyle === "venice";
  // The local WebUI dialect: its own fields, none of Venice's pass-throughs.
  const a1111 = apiStyle === "a1111";
  // Forge Couple detection, as the probe reported it. Read as a three-way on
  // purpose: the API answers 422 `always on script not found` for an alwayson
  // key the extension does not own, so the payload is never sent blind — and
  // "not probed yet" is not the same claim as "not installed".
  const forgeCoupleDetected = dialectOptions?.forgeCouple === true;
  // The probe answers at least once per opened connection (its status line is
  // what says so); before that, or after a failed probe, we simply do not know.
  const forgeCoupleChecked =
    modelsStatus !== null && modelsStatus.kind === "ok";
  const styleValue = form.stylePreset ?? "";
  // Seeded from the session cache so a re-opened connection paints its stored
  // value as a real option on the FIRST frame — no re-fetch, nothing to flash.
  const [styleList, setStyleList] = useState<StyleListState>(() => {
    const cached = readCachedStyles(styleCacheKey());
    return cached
      ? { styles: cached, status: stylesLoadedStatus(cached) }
      : { styles: [], status: null };
  });
  const { styles, status: stylesStatus } = styleList;
  const [fetchingStyles, setFetchingStyles] = useState(false);
  // Set by the Custom… option. A value that a LOADED list proves absent also
  // reads as custom, so a connection saved with `anime` stays visible and
  // editable instead of rendering as an empty select.
  const [customStyle, setCustomStyle] = useState(false);

  // The whole display decision (select value, options, escape hatch, warning,
  // suggestion) is this pure function's job — see utils/imageStyleOptions.ts.
  // Its invariant: the select's value is always one of its own options, and a
  // non-empty stored value never renders as Custom… until a loaded list proves
  // it absent.
  const styleDisplay = imageStyleDisplay({
    value: styleValue,
    styles,
    customRequested: customStyle,
  });

  /** Cache key for the styles list: the provider's base URL, falling back to
   *  the saved connection's when the probe targets it by id. */
  function styleCacheKey(): string | null {
    const target = styleProbeTarget();
    const baseUrl = target?.baseUrl ?? editing?.baseUrl ?? "";
    return baseUrl.trim() ? normalizeStyleBaseUrl(baseUrl) : null;
  }

  /** Target for the styles probe: a saved connection uses its STORED key unless
   *  the form's base URL or key were edited, in which case the draft is probed
   *  instead (same rule as the model list). */
  function styleProbeTarget(): {
    id?: string;
    baseUrl?: string;
    apiKey?: string;
  } | null {
    if (mode === "edit" && editing) {
      const baseUrlChanged = form.baseUrl.trim() !== editing.baseUrl;
      const apiKeyChanged =
        typeof form.apiKey === "string" && form.apiKey !== "";
      if (!baseUrlChanged && !apiKeyChanged) return { id: editing.id };
    }
    const baseUrl = form.baseUrl.trim();
    const apiKey =
      typeof form.apiKey === "string" && form.apiKey ? form.apiKey : undefined;
    if (baseUrl) return { baseUrl, apiKey };
    return apiKey ? { apiKey } : null;
  }

  async function loadStyles() {
    const target = styleProbeTarget();
    if (!target) {
      setStyleList({
        styles: [],
        status: {
          kind: "err",
          text: "Set a Base URL first (or save the connection).",
        },
      });
      return;
    }
    const cacheKey = styleCacheKey();
    setFetchingStyles(true);
    setStyleList((s) => ({ ...s, status: null }));
    try {
      const r = await fetchProviderImageStyles(target);
      // Only a SUCCESSFUL, non-empty list is worth caching: an empty one means
      // "not fetched", and caching it would suppress the fetch for the session.
      if (r.ok && r.styles.length > 0 && cacheKey)
        imageStyleCache.set(cacheKey, r.styles);
      setStyleList({
        styles: r.styles,
        status: r.ok
          ? r.styles.length
            ? stylesLoadedStatus(r.styles)
            : {
                kind: "err",
                text: "Connected, but the provider listed no styles — use Custom… to type one.",
              }
          : {
              kind: "err",
              text: r.message
                ? `Failed (${r.status ?? ""}): ${r.message}`
                : "Failed to load styles.",
            },
      });
    } catch (err) {
      setStyleList({
        styles: [],
        status: {
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        },
      });
    } finally {
      setFetchingStyles(false);
    }
  }

  // Auto-load for an existing Venice connection, the way the model list does on
  // edit. Keyed to the connection + dialect so switching a saved connection to
  // Venice loads the list too; edits to the base URL/key are the refresh
  // control's job (re-fetching on every keystroke would hammer the endpoint).
  // A cached list is already in state, so it is never re-fetched.
  useEffect(() => {
    if (mode !== "edit" || !editing) return;
    if ((form.apiStyle ?? "openai") !== "venice") return;
    if (readCachedStyles(styleCacheKey())) return;
    void loadStyles();
  }, [mode, editing?.id, form.apiStyle]);

  function handleStyleChange(next: string) {
    if (next === CUSTOM_STYLE_OPTION) {
      setCustomStyle(true);
      // The current value is kept, so a rejected `anime` can be corrected in
      // place rather than being wiped by opening the escape hatch.
      return;
    }
    setCustomStyle(false);
    setForm((f) => ({ ...f, stylePreset: next }));
  }

  // What the provider's own listing says about the SELECTED model. Read-only,
  // and absent for a model the listing did not describe: the block then simply
  // does not render, rather than reporting an error for a convenience.
  //
  // a1111 takes the dialect branch: its WebUI publishes no per-model
  // constraints at all, so the honest thing to show is the counts it DID give
  // us (checkpoints, samplers, schedulers) rather than an empty block.
  const capsLines = a1111
    ? dialectCapabilityLines({
        checkpoints: models.length,
        samplers: dialectOptions?.samplers?.length ?? 0,
        schedulers: dialectOptions?.schedulers?.length ?? 0,
      })
    : capabilityLines(form.model ? modelSpecs[form.model] : undefined);

  return (
    <Card as="form" variant="elevated" padding="md" onSubmit={onSubmit}>
      <Stack direction="column" align="stretch" gap="sm">
        <Header
          variant="panel"
          bordered
          title={
            mode === "create"
              ? "New Image Provider Connection"
              : `Edit: ${editing?.label ?? ""}`
          }
        />

        <FormSection icon="Plug" title="API Style & Connection">
          <Stack direction="column" align="stretch" gap="xs">
            <SimpleSelect<ImageApiStyle>
              label="API Style"
              tooltip={
                a1111
                  ? "Talks to a local AUTOMATIC1111 / Forge WebUI over its own /sdapi/v1 API — the WebUI must be started with --api. Steps, CFG scale, sampler and scheduler go with every request."
                  : "Venice sends negative prompts, seeds, style presets, and watermark controls; OpenAI-compatible sends standard /v1/images/generations parameters."
              }
              size="sm"
              variant="filled"
              fullWidth
              value={form.apiStyle ?? "openai"}
              onChange={(style) => setForm((f) => ({ ...f, apiStyle: style }))}
              options={API_STYLE_OPTIONS}
              aria-label="Image API style"
              helperText={
                a1111
                  ? "Local AUTOMATIC1111 / Forge WebUI (/sdapi/v1 — requires --api)."
                  : venice
                    ? "Venice image API with negative prompts, seeds, and style presets."
                    : "Standard OpenAI-compatible /v1/images/generations endpoint."
              }
            />

            <TextInput
              label="Connection Name"
              tooltip="A friendly display name to identify this image provider in your list."
              size="sm"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder={
                a1111 ? "e.g. Local Forge SDXL" : "e.g. Venice Images"
              }
            />

            <TextInput
              label="Base URL"
              tooltip={
                a1111
                  ? "Root URL of your local AUTOMATIC1111 / Forge WebUI (started with --api), e.g. http://127.0.0.1:7860."
                  : "The OpenAI-compatible or Venice API root endpoint (usually ending in /v1)."
              }
              size="sm"
              value={form.baseUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, baseUrl: e.target.value }))
              }
              placeholder={
                a1111 ? "http://127.0.0.1:7860" : "https://api.venice.ai/api/v1"
              }
              leftIcon={<Icon name="Globe" size={13} />}
              rightElement={
                venice && form.baseUrl !== "https://api.venice.ai/api/v1" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        baseUrl: "https://api.venice.ai/api/v1",
                      }))
                    }
                    title="Reset to default Venice endpoint"
                  >
                    Default
                  </Button>
                ) : undefined
              }
            />

            <ApiKeyField {...apiKey} />

            <TextInput
              label={a1111 ? "Checkpoint" : "Model ID"}
              tooltip={
                a1111
                  ? "Leave the checkpoint empty to use whatever the WebUI already has loaded: the request then sends no override at all, and your WebUI's own state is never touched."
                  : "Enter a model identifier manually or click Fetch models to load available models from the provider."
              }
              size="sm"
              value={form.model}
              onChange={(e) =>
                setForm((f) => ({ ...f, model: e.target.value }))
              }
              placeholder={
                a1111 ? "e.g. sd_xl_base_1.0.safetensors" : "e.g. flux-dev"
              }
              leftIcon={<Icon name="Images" size={13} />}
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
                  Fetch models
                </Button>
              }
            />
            {models.length > 0 && (
              <SimpleSelect
                label={
                  a1111
                    ? `Select from Fetched Checkpoints (${models.length} available)`
                    : `Select from Fetched Models (${models.length} available)`
                }
                size="xs"
                variant="filled"
                fullWidth
                value={models.includes(form.model) ? form.model : ""}
                onChange={(selectedModel) => {
                  if (selectedModel) {
                    setForm((f) => ({ ...f, model: selectedModel }));
                  }
                }}
                placeholder="-- Select a fetched model --"
                options={models.map((m) => ({
                  value: m,
                  label: m,
                  icon: <Icon name="Images" size={12} />,
                }))}
              />
            )}
            {modelsStatus && (
              <StatusMessage variant="inline" tone={modelsStatus.kind}>
                {modelsStatus.text}
              </StatusMessage>
            )}

            {capsLines.length > 0 && (
              <Card variant="panel" padding="xs">
                <Stack direction="column" align="stretch" gap="2xs">
                  <Text
                    as="span"
                    variant="label"
                    size="xs"
                    weight="semibold"
                    tone="primary"
                  >
                    {a1111
                      ? "What this WebUI offers"
                      : `What “${form.model}” accepts`}
                  </Text>
                  {capsLines.map((line) => (
                    <Text key={line} as="p" size="2xs" tone="secondary">
                      {line}
                    </Text>
                  ))}
                  <Text as="p" size="2xs" tone="muted">
                    {a1111
                      ? "Read-only — from the WebUI's own /sdapi/v1 listing."
                      : "Read-only — from the provider's own model listing."}
                  </Text>
                </Stack>
              </Card>
            )}
          </Stack>
        </FormSection>

        <FormSection icon="Aperture" title="Image Settings">
          <Stack direction="column" align="stretch" gap="xs">
            <FormGrid cols={a1111 ? 1 : 2} gap="xs">
              <SimpleSelect
                label="Image Size"
                tooltip={
                  a1111
                    ? 'Sent as width/height to the WebUI. "auto" sends no size at all, so the WebUI\'s own default applies.'
                    : 'Sent as width/height. "auto" lets the provider choose.'
                }
                size="sm"
                variant="filled"
                fullWidth
                value={form.size ?? "auto"}
                onChange={(size) => setForm((f) => ({ ...f, size }))}
                options={sizeOptions.map((s) => ({ value: s, label: s }))}
                aria-label="Image size"
              />

              {!a1111 && (
                <TextInput
                  label="Aspect Ratio"
                  tooltip="Used instead of Image Size for models that reject width/height (such as the Venice qwen-image family). Leave empty to send the Image Size."
                  size="sm"
                  value={form.aspectRatio ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, aspectRatio: e.target.value }))
                  }
                  placeholder="e.g. 3:2"
                  leftIcon={<Icon name="Ratio" size={13} />}
                />
              )}
            </FormGrid>

            {venice && (
              <Stack direction="column" align="stretch" gap="2xs">
                <SimpleSelect
                  label="Style Preset"
                  tooltip="Fetched from Venice's /image/styles endpoint (case-sensitive and title-cased). None sends no style_preset. Venice applies style presets on only some models — to guarantee a style on every model, put style keywords in your preset's Positive Prefix instead."
                  size="sm"
                  variant="filled"
                  fullWidth
                  value={styleDisplay.selectValue}
                  onChange={handleStyleChange}
                  options={styleDisplay.options}
                  placeholder="None (send no style)"
                  aria-label="Style preset"
                  rightElement={
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void loadStyles()}
                      disabled={
                        fetchingStyles ||
                        (mode !== "edit" && !form.baseUrl.trim())
                      }
                      isLoading={fetchingStyles}
                      leftIcon="RefreshCw"
                    >
                      Fetch styles
                    </Button>
                  }
                />
                {styleDisplay.showCustomInput && (
                  <TextInput
                    label="Custom style"
                    size="sm"
                    value={styleValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stylePreset: e.target.value }))
                    }
                    placeholder="The exact value the provider expects"
                  />
                )}
                {fetchingStyles ? (
                  <StatusMessage variant="inline" loading>
                    Loading styles…
                  </StatusMessage>
                ) : (
                  stylesStatus && (
                    <StatusMessage variant="inline" tone={stylesStatus.kind}>
                      {stylesStatus.text}
                    </StatusMessage>
                  )
                )}
                {styleDisplay.showWarning && (
                  <StatusMessage variant="banner" tone="warn">
                    Warning: “{styleValue}” is not one of the styles this
                    provider lists, so generating with it fails with a 400
                    (Invalid style requested)
                    {styleDisplay.suggestion
                      ? ` — did you mean “${styleDisplay.suggestion}”?`
                      : ""}
                    . Pick a listed value, or None — a blank value is not sent
                    at all.
                  </StatusMessage>
                )}
              </Stack>
            )}

            <FormGrid cols={2} gap="xs">
              <SimpleSelect
                label={a1111 ? "Variants (batch size)" : "Variants"}
                tooltip={
                  a1111
                    ? "Sent as batch_size: one request renders the whole batch, so 2 takes about twice as long. Each image comes back as its own result."
                    : "Venice only. Keep at 1 unless you want several results per request."
                }
                size="sm"
                variant="filled"
                fullWidth
                value={String(form.variants ?? 1)}
                onChange={(variants) =>
                  setForm((f) => ({ ...f, variants: Number(variants) }))
                }
                options={VARIANT_OPTIONS.map((v) => ({ value: v, label: v }))}
                aria-label="Image variants"
              />

              <TextInput
                label="Seed"
                tooltip={
                  a1111
                    ? "Leave empty for a random seed: blank is sent as -1, which this dialect reads as random. 0 is a real seed here (unlike Venice), so typing 0 pins the first image."
                    : "Leave empty for a random seed. Set a number to make re-rolls comparable — the same seed and prompt reproduce the same image. A seed is only honoured by providers that support one (Venice does; OpenAI-compatible does not)."
                }
                size="sm"
                type="number"
                min={0}
                step={1}
                value={
                  form.seed === undefined || form.seed === null
                    ? ""
                    : String(form.seed)
                }
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setForm((f) => ({
                    ...f,
                    seed: digits === "" ? null : Number(digits),
                  }));
                }}
                placeholder="Random"
                leftIcon={<Icon name="Dices" size={13} />}
              />
            </FormGrid>

            {!a1111 && (
              <Stack direction="column" align="stretch" gap="xs">
                <SwitchRow
                  icon="Shield"
                  title="Safe Mode"
                  tooltip="Ask the provider to blur or filter adult content when supported."
                  description="Ask the provider to blur adult content. Leave off."
                  checked={form.safeMode ?? false}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, safeMode: e.target.checked }))
                  }
                />

                {venice && (
                  <SwitchRow
                    icon="EyeOff"
                    title="Hide Watermark"
                    tooltip="Venice-specific option (hide_watermark) to omit the Venice watermark from generated images."
                    description="Request results without the Venice watermark."
                    checked={form.hideWatermark ?? false}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        hideWatermark: e.target.checked,
                      }))
                    }
                  />
                )}
              </Stack>
            )}
          </Stack>
        </FormSection>

        {a1111 && (
          <FormSection
            icon="SlidersHorizontal"
            title="Sampling"
            tooltip="Nothing here is written to the WebUI's settings: the checkpoint travels as a per-request override that the WebUI restores immediately afterwards, and the sampling values live on the request itself."
          >
            <Stack direction="column" align="stretch" gap="xs">
              <FormGrid cols={2} gap="xs">
                <Slider
                  label="Steps"
                  description="1–150 sampling steps. Empty (Default) sends no steps so the WebUI's own default applies."
                  min={1}
                  max={150}
                  step={1}
                  value={form.steps ?? undefined}
                  defaultPreview={25}
                  integer
                  clearable
                  clearedValue={undefined}
                  onChange={(val) =>
                    setForm((f) => ({ ...f, steps: val ?? undefined }))
                  }
                />

                <Slider
                  label="CFG scale"
                  description="How strictly the prompt is followed (0–30). Empty (Default) sends no value."
                  min={0}
                  max={30}
                  step={0.5}
                  value={form.cfgScale ?? undefined}
                  defaultPreview={7}
                  clearable
                  clearedValue={undefined}
                  onChange={(val) =>
                    setForm((f) => ({ ...f, cfgScale: val ?? undefined }))
                  }
                />
              </FormGrid>

              <FormGrid cols={2} gap="xs">
                {dialectOptions?.samplers?.length ? (
                  <SimpleSelect
                    label="Sampler"
                    tooltip='Sent as sampler_name. The list is the WebUI&apos;s own (/sdapi/v1/samplers). "WebUI default" sends nothing, so whatever your WebUI has selected applies.'
                    size="sm"
                    variant="filled"
                    fullWidth
                    value={form.sampler ?? ""}
                    onChange={(sampler) => setForm((f) => ({ ...f, sampler }))}
                    options={[
                      { value: "", label: "WebUI default" },
                      ...(dialectOptions.samplers ?? []).map((name) => ({
                        value: name,
                        label: name,
                      })),
                    ]}
                    aria-label="Sampler"
                  />
                ) : (
                  <TextInput
                    label="Sampler"
                    tooltip="Sent as sampler_name. This WebUI did not list its samplers — type exactly what it accepts, or leave empty to send none."
                    size="sm"
                    value={form.sampler ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sampler: e.target.value }))
                    }
                    placeholder="e.g. DPM++ 2M"
                    leftIcon={<Icon name="SlidersHorizontal" size={13} />}
                  />
                )}

                {dialectOptions?.schedulers?.length ? (
                  <SimpleSelect
                    label="Scheduler"
                    tooltip='Sent as scheduler. The list is the WebUI&apos;s own (/sdapi/v1/schedulers) — your build reports "Automatic" as its default, which is what "WebUI default" leaves in place.'
                    size="sm"
                    variant="filled"
                    fullWidth
                    value={form.scheduler ?? ""}
                    onChange={(scheduler) =>
                      setForm((f) => ({ ...f, scheduler }))
                    }
                    options={[
                      { value: "", label: "WebUI default" },
                      ...(dialectOptions.schedulers ?? []).map((name) => ({
                        value: name,
                        label: name,
                      })),
                    ]}
                    aria-label="Scheduler"
                  />
                ) : (
                  <TextInput
                    label="Scheduler"
                    tooltip="Sent as scheduler. Empty sends none, so the WebUI's own default applies."
                    size="sm"
                    value={form.scheduler ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scheduler: e.target.value }))
                    }
                    placeholder="e.g. Karras"
                    leftIcon={<Icon name="Aperture" size={13} />}
                  />
                )}
              </FormGrid>

              <TextInput
                label="Timeout (seconds)"
                tooltip="How long one image may take (stored in milliseconds). Empty uses the dialect default — 10 minutes (600s) for Automatic1111, since a local render easily outlasts the global 180s timeout."
                size="sm"
                type="number"
                min={1}
                step={1}
                value={
                  form.timeoutMs === undefined || form.timeoutMs === null
                    ? ""
                    : String(Math.round(form.timeoutMs / 1000))
                }
                onChange={(e) => {
                  const ms = timeoutSecondsToMs(e.target.value);
                  setForm((f) => ({
                    ...f,
                    timeoutMs: ms === undefined ? null : ms,
                  }));
                }}
                placeholder="600"
                leftIcon={<Icon name="Timer" size={13} />}
              />
            </Stack>
          </FormSection>
        )}

        {a1111 && (
          <FormSection
            icon="LayoutGrid"
            title="Character Regions"
            tooltip="Read-only detection uses the /sdapi/v1/script-info probe run when the connection is opened or Fetch models is pressed. The API rejects the region payload with a 422 when the extension is absent, so it is never sent on a guess."
          >
            <Stack direction="column" align="stretch" gap="xs">
              <SimpleSelect<RegionDirection>
                label="Region direction"
                tooltip="How the canvas is divided between characters. Horizontal gives each one a column (left to right) in prompt order; Vertical gives each one a band (top to bottom). Geometry travels as the extension's Advanced region mapping without touching the WebUI's own settings."
                size="sm"
                variant="filled"
                fullWidth
                value={form.regionDirection ?? "Horizontal"}
                onChange={(direction) =>
                  setForm((f) => ({ ...f, regionDirection: direction }))
                }
                options={REGION_DIRECTION_OPTIONS}
                aria-label="Region direction"
              />

              <SwitchRow
                icon="Users"
                title="Regions"
                tooltip="A scene with one character has no regions at all, whatever this is set to."
                description="Give each character its own attention region when the scene has two or more of them, preventing traits from bleeding into one another."
                checked={form.regionsEnabled ?? true}
                onChange={(e) =>
                  setForm((f) => ({ ...f, regionsEnabled: e.target.checked }))
                }
              />

              {forgeCoupleDetected ? (
                <StatusMessage variant="banner" tone="ok">
                  Forge Couple detected in this WebUI — with two or more
                  characters in frame, each one gets its own attention region.
                  The regions travel on the request itself; nothing in the
                  WebUI's own settings is changed.
                </StatusMessage>
              ) : forgeCoupleChecked ? (
                <StatusMessage variant="banner" tone="warn">
                  Forge Couple is <strong>not installed</strong> in this WebUI,
                  so regions are disabled and renders are unchanged by the two
                  settings above. Install the <strong>Forge Couple</strong>{" "}
                  extension (<code>sd-forge-couple</code>) from the WebUI's
                  Extensions tab, restart it, then Fetch models to re-check — a
                  WebUI that has it will say so here.
                </StatusMessage>
              ) : (
                <StatusMessage variant="banner" tone="neutral">
                  This WebUI's extension list is not known here yet — Fetch
                  models against it, and this line reports whether Forge Couple
                  is installed. Until it is, regions are disabled and renders
                  are unchanged.
                </StatusMessage>
              )}
            </Stack>
          </FormSection>
        )}

        <FormSection icon="Wand2" title="Prompt Writer">
          <SimpleSelect
            label="Prompt Writer"
            tooltip='The text connection that writes the image prompt. "Current active text provider" follows whichever text connection is active, and falls back to it if the chosen one is deleted.'
            size="sm"
            variant="filled"
            fullWidth
            value={promptWriterId}
            onChange={(id) =>
              setForm((f) => ({
                ...f,
                promptProviderId: id === "" ? null : id,
              }))
            }
            options={promptWriterOptions}
            placeholder="Current active text provider"
            aria-label="Prompt writer"
          />
        </FormSection>

        <EditorActionBar
          mode={mode}
          busy={busy}
          dirty={dirty}
          testingConnection={testingConnection}
          status={testStatus}
          onDismissStatus={onDismissStatus}
          onTest={onTest}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </Stack>
    </Card>
  );
}
