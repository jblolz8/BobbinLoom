import { useEffect, useState, type Dispatch, type FormEvent, type MouseEvent, type SetStateAction } from "react";
import { Button, Icon, SimpleSelect, SwitchRow, TextInput } from "../../base";
import type { ImageApiStyle } from "../../../../schemas";
import { fetchProviderImageStyles } from "../../../api";
import type { ModelCapabilities, ProviderConnection, ProviderConnectionPayload, ProviderModelCapabilities } from "../../../api";
import { CUSTOM_STYLE_OPTION, imageStyleDisplay } from "../../../utils/imageStyleOptions";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

const API_STYLE_OPTIONS: Array<{ value: ImageApiStyle; label: string }> = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "venice", label: "Venice" }
];

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
  return { kind: "ok", text: `${styles.length} style${styles.length === 1 ? "" : "s"} loaded.` };
}

/** OpenAI's image size enum; "auto" lets the provider pick. */
const IMAGE_SIZE_OPTIONS = ["auto", "1024x1024", "1536x1024", "1024x1536", "1024x1792", "1792x1024"];

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
    if (caps.steps.default !== undefined) parts.push(`${caps.steps.default} default`);
    if (caps.steps.max !== undefined) parts.push(`up to ${caps.steps.max}`);
    if (parts.length) lines.push(`Steps: ${parts.join(", ")}.`);
  }

  const ratios = caps.aspectRatios?.length ? caps.aspectRatios.join(", ") : "";
  const defaultRatio = caps.defaultAspectRatio ? ` (default ${caps.defaultAspectRatio})` : "";
  const divisor = caps.widthHeightDivisor;
  if (divisor !== undefined && ratios) {
    lines.push(`Sizing: width/height in multiples of ${divisor}, or aspect_ratio from ${ratios}${defaultRatio}.`);
  } else if (divisor !== undefined) {
    lines.push(`Sizing: this model takes width/height, in multiples of ${divisor}.`);
  } else if (ratios) {
    lines.push(
      `Sizing: this model takes aspect_ratio, one of ${ratios}${defaultRatio} — it does not take width/height, so set Aspect Ratio above (Image Size is then not sent).`
    );
  }

  if (caps.resolutions?.length) {
    lines.push(`Resolutions: ${caps.resolutions.join(", ")}.`);
  }

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
  modelsStatus: EditorStatus;
  fetchingModels: boolean;
  onFetchModels: () => void;
  testStatus: EditorStatus;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onTest: (e: MouseEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Every text connection — the candidates for writing this prompt. */
  textConnections: ProviderConnection[];
};

/**
 * The image-provider editor. Its fields are its own: endpoint dialect, size or
 * aspect ratio, the Venice pass-throughs, and — the odd one out — the text
 * connection that WRITES the prompt, since an image endpoint cannot compose one.
 * It also shows, read-only, what the provider's own model listing says about the
 * selected model.
 *
 * State and requests live in `ProviderConnections`, like the text editor.
 */
export function ImageConnectionEditor({
  mode,
  editing,
  form,
  setForm,
  apiKey,
  models,
  modelSpecs,
  modelsStatus,
  fetchingModels,
  onFetchModels,
  testStatus,
  busy,
  onSubmit,
  onTest,
  onCancel,
  onDelete,
  textConnections
}: ImageConnectionEditorProps) {
  // A custom size typed into providers.json by hand stays selectable instead of
  // silently reading as "nothing selected".
  const sizeOptions = form.size && !IMAGE_SIZE_OPTIONS.includes(form.size)
    ? [...IMAGE_SIZE_OPTIONS, form.size]
    : IMAGE_SIZE_OPTIONS;

  // "" is the "follow the active text provider" slot (the server stores it as
  // null). A dangling id stays visible so it can be re-pointed, rather than
  // showing an empty select.
  const promptWriterOptions = [
    { value: "", label: "Current active text provider" },
    ...textConnections.map((c) => ({ value: c.id, label: c.label }))
  ];
  const promptWriterId = form.promptProviderId ?? "";
  if (promptWriterId && !textConnections.some((c) => c.id === promptWriterId)) {
    promptWriterOptions.push({ value: promptWriterId, label: `${promptWriterId} (not found)` });
  }

  // ── Style Preset ──
  // The valid values belong to the PROVIDER, not to the user. This control used
  // to be free text whose placeholder read `e.g. anime`, and Venice rejects
  // that: its values are title-cased (`Anime`) and the field is case-sensitive.
  // The 400 lands after the text model has already written (and been paid for)
  // the prompt, which is why the list is now fetched and the field is a select.
  const venice = (form.apiStyle ?? "openai") === "venice";
  const styleValue = form.stylePreset ?? "";
  // Seeded from the session cache so a re-opened connection paints its stored
  // value as a real option on the FIRST frame — no re-fetch, nothing to flash.
  const [styleList, setStyleList] = useState<StyleListState>(() => {
    const cached = readCachedStyles(styleCacheKey());
    return cached ? { styles: cached, status: stylesLoadedStatus(cached) } : { styles: [], status: null };
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
  const styleDisplay = imageStyleDisplay({ value: styleValue, styles, customRequested: customStyle });

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
  function styleProbeTarget(): { id?: string; baseUrl?: string; apiKey?: string } | null {
    if (mode === "edit" && editing) {
      const baseUrlChanged = form.baseUrl.trim() !== editing.baseUrl;
      const apiKeyChanged = typeof form.apiKey === "string" && form.apiKey !== "";
      if (!baseUrlChanged && !apiKeyChanged) return { id: editing.id };
    }
    const baseUrl = form.baseUrl.trim();
    const apiKey = typeof form.apiKey === "string" && form.apiKey ? form.apiKey : undefined;
    if (baseUrl) return { baseUrl, apiKey };
    return apiKey ? { apiKey } : null;
  }

  async function loadStyles() {
    const target = styleProbeTarget();
    if (!target) {
      setStyleList({ styles: [], status: { kind: "err", text: "Set a Base URL first (or save the connection)." } });
      return;
    }
    const cacheKey = styleCacheKey();
    setFetchingStyles(true);
    setStyleList((s) => ({ ...s, status: null }));
    try {
      const r = await fetchProviderImageStyles(target);
      // Only a SUCCESSFUL, non-empty list is worth caching: an empty one means
      // "not fetched", and caching it would suppress the fetch for the session.
      if (r.ok && r.styles.length > 0 && cacheKey) imageStyleCache.set(cacheKey, r.styles);
      setStyleList({
        styles: r.styles,
        status: r.ok
          ? r.styles.length
            ? stylesLoadedStatus(r.styles)
            : { kind: "err", text: "Connected, but the provider listed no styles — use Custom… to type one." }
          : { kind: "err", text: r.message ? `Failed (${r.status ?? ""}): ${r.message}` : "Failed to load styles." }
      });
    } catch (err) {
      setStyleList({ styles: [], status: { kind: "err", text: err instanceof Error ? err.message : String(err) } });
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
  const capsLines = capabilityLines(form.model ? modelSpecs[form.model] : undefined);

  return (
    <form className="conn-editor conn-editor-card" onSubmit={onSubmit}>
      <div className="conn-editor-header">
        <h4>{mode === "create" ? "New Image Provider Connection" : `Edit: ${editing?.label ?? ""}`}</h4>
      </div>

      <div className="conn-section">
        <h5 className="form-section-title conn-section-title">
          <Icon name="Plug" size={14} />
          <span>Connection Basics</span>
        </h5>
        <div className="conn-fields-group">
          <div className="conn-fields-row-2">
            <TextInput
              label="Name"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Venice Images"
            />

            <TextInput
              label="Base URL"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.venice.ai/api/v1"
              leftIcon={<Icon name="Globe" size={14} />}
            />
          </div>

          <ApiKeyField {...apiKey} />
        </div>
      </div>

      <div className="conn-section">
        <h5 className="form-section-title conn-section-title">
          <Icon name="Images" size={14} />
          <span>Model</span>
        </h5>
        <div className="conn-fields-group">
          <div>
            <TextInput
              label="Model ID"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="e.g. flux-dev"
              leftIcon={<Icon name="Images" size={14} />}
              rightElement={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onFetchModels}
                  disabled={fetchingModels || busy || (mode !== "edit" && !form.baseUrl.trim())}
                  isLoading={fetchingModels}
                  leftIcon={<Icon name="RefreshCw" size={13} className={fetchingModels ? "animate-spin" : ""} />}
                >
                  Fetch models
                </Button>
              }
            />
            {models.length > 0 && (
              <div className="base-form-field form-field" style={{ marginTop: "0.5rem" }}>
                <span className="field-label-text">Select from Fetched Models ({models.length} available)</span>
                <SimpleSelect
                  size="sm"
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
                    icon: <Icon name="Images" size={13} />,
                  }))}
                />
              </div>
            )}
            {modelsStatus && <p className={`conn-status ${modelsStatus.kind}`}>{modelsStatus.text}</p>}

            {/* Read-only capabilities for the model in the field above, read from
                the provider's OWN listing (the same response that filled the
                list) — the only place a provider says which sizing parameter a
                model takes. Nothing renders when the model is unknown to the
                listing, or when the probe failed. */}
            {capsLines.length > 0 && (
              <div className="base-form-field form-field" style={{ marginTop: "0.5rem" }}>
                <span className="field-label-text">What “{form.model}” accepts</span>
                {capsLines.map((line) => (
                  <p key={line} className="conn-field-helper">{line}</p>
                ))}
                <p className="conn-field-helper">Read-only — from the provider's own model listing.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="conn-section">
        <h5 className="form-section-title conn-section-title">
          <Icon name="Aperture" size={14} />
          <span>Image Settings</span>
        </h5>
        <div className="conn-fields-group">
          <div className="conn-fields-row-2">
            <div className="conn-field-group">
              <span className="field-label-text">API Style</span>
              <SimpleSelect<ImageApiStyle>
                size="sm"
                variant="filled"
                fullWidth
                value={form.apiStyle ?? "openai"}
                onChange={(style) => setForm((f) => ({ ...f, apiStyle: style }))}
                options={API_STYLE_OPTIONS}
                aria-label="Image API style"
              />
              <p className="conn-field-helper">
                Venice sends negative prompts, seeds and style presets; OpenAI-compatible sends none of them.
              </p>
            </div>

            <div className="conn-field-group">
              <span className="field-label-text">Image Size</span>
              <SimpleSelect
                size="sm"
                variant="filled"
                fullWidth
                value={form.size ?? "auto"}
                onChange={(size) => setForm((f) => ({ ...f, size }))}
                options={sizeOptions.map((s) => ({ value: s, label: s }))}
                aria-label="Image size"
              />
              <p className="conn-field-helper">Sent as width/height. "auto" lets the provider choose.</p>
            </div>
          </div>

          <TextInput
            label="Aspect Ratio"
            value={form.aspectRatio ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, aspectRatio: e.target.value }))}
            placeholder="e.g. 3:2"
            leftIcon={<Icon name="Ratio" size={14} />}
            helperText='Used instead of Image Size for models that reject width/height (the Venice qwen-image family). Leave empty to send the size.'
          />

          <div className="conn-fields-row-2">
            <div className="conn-field-group">
              <span className="field-label-text">Style Preset</span>
              {venice ? (
                <>
                  <SimpleSelect
                    size="sm"
                    variant="filled"
                    fullWidth
                    value={styleDisplay.selectValue}
                    onChange={handleStyleChange}
                    options={styleDisplay.options}
                    placeholder="None (send no style)"
                    aria-label="Style preset"
                  />
                  {styleDisplay.showCustomInput && (
                    <TextInput
                      label="Custom style"
                      value={styleValue}
                      onChange={(e) => setForm((f) => ({ ...f, stylePreset: e.target.value }))}
                      placeholder="The exact value the provider expects"
                    />
                  )}
                  <div className="base-form-field form-field" style={{ marginTop: "0.5rem" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void loadStyles()}
                      disabled={fetchingStyles || (mode !== "edit" && !form.baseUrl.trim())}
                      isLoading={fetchingStyles}
                      leftIcon={<Icon name="RefreshCw" size={13} className={fetchingStyles ? "animate-spin" : ""} />}
                    >
                      Fetch styles
                    </Button>
                  </div>
                  {/* The fetch is in flight: say so, rather than leaving the
                      field bare while the list is unknown. */}
                  {fetchingStyles ? (
                    <p className="conn-status">Loading styles…</p>
                  ) : (
                    stylesStatus && <p className={`conn-status ${stylesStatus.kind}`}>{stylesStatus.text}</p>
                  )}
                  {styleDisplay.showWarning && (
                    <p className="conn-status warn">
                      Warning: “{styleValue}” is not one of the styles this provider lists, so generating with it fails
                      with a 400 (Invalid style requested)
                      {styleDisplay.suggestion ? ` — did you mean “${styleDisplay.suggestion}”?` : ""}. Pick a listed value, or None —
                      a blank value is not sent at all.
                    </p>
                  )}
                  <p className="conn-field-helper">
                    Venice only. The list is the provider's own (fetched from the keyless <code>/image/styles</code>);
                    values are case-sensitive and title-cased. None sends no <code>style_preset</code>. Venice applies a style
                    preset on only <strong>some</strong> models and publishes no list of which ones — the Models API
                    carries no support flag either — so a preset can be accepted with no visible effect. When a style
                    must land whatever model is set, put the style keywords in the preset's <strong>Positive Prefix</strong>
                    instead: that reaches every model.
                  </p>
                </>
              ) : (
                <p className="conn-field-helper">
                  Venice only — the OpenAI-compatible dialect has no style parameter, so this is not sent. Switch API
                  Style to Venice to set it.
                </p>
              )}
            </div>

            <div className="conn-field-group">
              <span className="field-label-text">Variants</span>
              <SimpleSelect
                size="sm"
                variant="filled"
                fullWidth
                value={String(form.variants ?? 1)}
                onChange={(variants) => setForm((f) => ({ ...f, variants: Number(variants) }))}
                options={VARIANT_OPTIONS.map((v) => ({ value: v, label: v }))}
                aria-label="Image variants"
              />
              <p className="conn-field-helper">Venice only. Keep at 1 unless you want several results per request.</p>
            </div>
          </div>

          <div className="conn-fields-row-2">
            <TextInput
              label="Seed"
              type="number"
              min={0}
              step={1}
              value={form.seed === undefined || form.seed === null ? "" : String(form.seed)}
              onChange={(e) => {
                // Digits only. An empty field means "let the provider pick" and
                // is sent as null — NEVER as 0, which the provider reads as a
                // concrete value rather than "no seed". Null is what CLEARS a
                // stored seed; an absent field cannot overwrite one.
                const digits = e.target.value.replace(/\D/g, "");
                setForm((f) => ({ ...f, seed: digits === "" ? null : Number(digits) }));
              }}
              placeholder="Random"
              leftIcon={<Icon name="Dices" size={14} />}
              helperText="Leave empty for a random seed. Set a number to make re-rolls comparable — the same seed and prompt reproduce the same image. A seed is only honoured by providers that support one: Venice does, the OpenAI-compatible dialect does not."
            />
          </div>

          {/* Grouped the way the Chat tab groups its own toggle rows, so the two
              read as a set rather than two loose boxes in the card. */}
          <div className="conn-toggle-group">
            <SwitchRow
              icon="Shield"
              title="Safe Mode"
              description="Ask the provider to blur adult content. Leave off."
              checked={form.safeMode ?? false}
              onChange={(e) => setForm((f) => ({ ...f, safeMode: e.target.checked }))}
            />

            <SwitchRow
              icon="EyeOff"
              title="Hide Watermark"
              description="Venice only. Request results without the Venice watermark."
              checked={form.hideWatermark ?? false}
              onChange={(e) => setForm((f) => ({ ...f, hideWatermark: e.target.checked }))}
            />
          </div>
        </div>
      </div>

      <div className="conn-section">
        <h5 className="form-section-title conn-section-title">
          <Icon name="Wand2" size={14} />
          <span>Prompt Writer</span>
        </h5>
        <div className="conn-fields-group">
          <div className="conn-field-group">
            <span className="field-label-text">Prompt Writer</span>
            <SimpleSelect
              size="sm"
              variant="filled"
              fullWidth
              value={promptWriterId}
              onChange={(id) => setForm((f) => ({ ...f, promptProviderId: id === "" ? null : id }))}
              options={promptWriterOptions}
              placeholder="Current active text provider"
              aria-label="Prompt writer"
            />
            <p className="conn-field-helper">
              The text connection that writes the image prompt. "Current active text provider" follows whichever text
              connection is active, and falls back to it if the chosen one is deleted.
            </p>
          </div>
        </div>
      </div>

      {testStatus && <p className={`conn-status ${testStatus.kind}`}>{testStatus.text}</p>}
      <div className="settings-actions conn-actions-bar">
        <div className="actions-left">
          <Button type="submit" variant="primary" size="sm" disabled={busy} isLoading={busy} leftIcon={<Icon name="Save" size={14} />}>
            Save
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onTest} disabled={busy} leftIcon={<Icon name="Activity" size={14} />}>
            Test connection
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} leftIcon={<Icon name="X" size={14} />}>
            Cancel
          </Button>
        </div>
        {mode === "edit" && (
          <Button type="button" variant="danger" size="sm" onClick={onDelete} leftIcon={<Icon name="Trash2" size={14} />}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
