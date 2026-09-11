import { useEffect, useState, type Dispatch, type FormEvent, type MouseEvent, type SetStateAction } from "react";
import { Button, Icon, SimpleSelect, SwitchRow, TextInput } from "../../base";
import type { ImageApiStyle } from "../../../../schemas";
import { fetchProviderImageStyles } from "../../../api";
import type { ProviderConnection, ProviderConnectionPayload } from "../../../api";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

const API_STYLE_OPTIONS: Array<{ value: ImageApiStyle; label: string }> = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "venice", label: "Venice" }
];

/** The Style Preset select's escape hatch. Not a valid style value (a provider
 *  can never return it), so it can never collide with a real one: a self-hosted
 *  or future endpoint that does not implement the styles listing stays usable
 *  through it. */
const CUSTOM_STYLE_OPTION = "__custom__";

/** The None option's value. An empty stylePreset is OMITTED from the request
 *  body by the Venice adapter, so None really does send nothing. */
const NONE_STYLE_OPTION = "";

/** OpenAI's image size enum; "auto" lets the provider pick. */
const IMAGE_SIZE_OPTIONS = ["auto", "1024x1024", "1536x1024", "1024x1536", "1024x1792", "1792x1024"];

const VARIANT_OPTIONS = ["1", "2", "3", "4"];

/**
 * The image-provider editor. Its fields are its own: endpoint dialect, size or
 * aspect ratio, the Venice pass-throughs, and — the odd one out — the text
 * connection that WRITES the prompt, since an image endpoint cannot compose one.
 *
 * State and requests live in `ProviderConnections`, like the text editor.
 */
export type ImageConnectionEditorProps = {
  mode: "create" | "edit";
  editing: ProviderConnection | null;
  form: ProviderConnectionPayload;
  setForm: Dispatch<SetStateAction<ProviderConnectionPayload>>;
  apiKey: ApiKeyFieldProps;
  models: string[];
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

export function ImageConnectionEditor({
  mode,
  editing,
  form,
  setForm,
  apiKey,
  models,
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
  const [styles, setStyles] = useState<string[]>([]);
  const [stylesStatus, setStylesStatus] = useState<EditorStatus>(null);
  const [fetchingStyles, setFetchingStyles] = useState(false);
  // Set by the Custom… option. A value that is NOT in the fetched list also
  // reads as custom, so a connection saved with `anime` stays visible and
  // editable instead of rendering as an empty select.
  const [customStyle, setCustomStyle] = useState(false);

  const styleInList = styles.includes(styleValue);
  // Exactly the reported failure: a stored value the provider would reject.
  // Only asserted once the list has actually arrived — an empty list means
  // "not fetched", not "nothing valid".
  const styleNotListed = venice && styleValue !== "" && styles.length > 0 && !styleInList;
  const styleSuggestion = styleNotListed
    ? styles.find((s) => s.toLowerCase() === styleValue.trim().toLowerCase())
    : undefined;
  const showCustomStyle = venice && (customStyle || (styleValue !== "" && !styleInList));

  const styleOptions = [
    { value: NONE_STYLE_OPTION, label: "None", description: "Send no style_preset" },
    ...styles.map((s) => ({ value: s, label: s })),
    { value: CUSTOM_STYLE_OPTION, label: "Custom…", description: "Type an exact value" }
  ];

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
      setStylesStatus({ kind: "err", text: "Set a Base URL first (or save the connection)." });
      return;
    }
    setFetchingStyles(true);
    setStylesStatus(null);
    try {
      const r = await fetchProviderImageStyles(target);
      setStyles(r.styles);
      setStylesStatus(
        r.ok
          ? r.styles.length
            ? { kind: "ok", text: `${r.styles.length} style${r.styles.length === 1 ? "" : "s"} loaded.` }
            : { kind: "err", text: "Connected, but the provider listed no styles — use Custom… to type one." }
          : { kind: "err", text: r.message ? `Failed (${r.status ?? ""}): ${r.message}` : "Failed to load styles." }
      );
    } catch (err) {
      setStyles([]);
      setStylesStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setFetchingStyles(false);
    }
  }

  // Auto-load for an existing Venice connection, the way the model list does on
  // edit. Keyed to the connection + dialect so switching a saved connection to
  // Venice loads the list too; edits to the base URL/key are the refresh
  // control's job (re-fetching on every keystroke would hammer the endpoint).
  useEffect(() => {
    if (mode !== "edit" || !editing) return;
    if ((form.apiStyle ?? "openai") !== "venice") return;
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
                    value={showCustomStyle ? CUSTOM_STYLE_OPTION : styleValue}
                    onChange={handleStyleChange}
                    options={styleOptions}
                    placeholder="None (send no style)"
                    aria-label="Style preset"
                  />
                  {showCustomStyle && (
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
                  {stylesStatus && <p className={`conn-status ${stylesStatus.kind}`}>{stylesStatus.text}</p>}
                  {styleNotListed && (
                    <p className="conn-status warn">
                      Warning: “{styleValue}” is not one of the styles this provider lists, so generating with it fails
                      with a 400 (Invalid style requested)
                      {styleSuggestion ? ` — did you mean “${styleSuggestion}”?` : ""}. Pick a listed value, or None —
                      a blank value is not sent at all.
                    </p>
                  )}
                  <p className="conn-field-helper">
                    Venice only. The list is the provider's own (fetched from the keyless <code>/image/styles</code>);
                    values are case-sensitive and title-cased. None sends no <code>style_preset</code>.
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

          <SwitchRow
            icon="ShieldOff"
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
