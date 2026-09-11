import type { Dispatch, FormEvent, MouseEvent, SetStateAction } from "react";
import { Button, Icon, SimpleSelect, SwitchRow, TextInput } from "../../base";
import type { ImageApiStyle } from "../../../../schemas";
import type { ProviderConnection, ProviderConnectionPayload } from "../../../api";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

const API_STYLE_OPTIONS: Array<{ value: ImageApiStyle; label: string }> = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "venice", label: "Venice" }
];

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
            <TextInput
              label="Style Preset"
              value={form.stylePreset ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, stylePreset: e.target.value }))}
              placeholder="e.g. anime"
              helperText="Venice only. Ignored by OpenAI-compatible endpoints."
            />

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
