import type { Dispatch, FormEvent, MouseEvent, SetStateAction } from "react";
import { Button, Icon, SimpleSelect, TextInput } from "../../base";
import type { ProviderConnection, ProviderConnectionPayload } from "../../../api";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

/**
 * The text-provider editor, moved verbatim out of `ProviderConnections.tsx`.
 * Only the API-key block changed shape (it is now `<ApiKeyField>`, same markup
 * and behavior); everything else — sections, fields, action bar — is the same
 * JSX as before the split, so the text tab looks and behaves exactly as it did.
 *
 * All state and every request stay in `ProviderConnections`; this component
 * renders and calls back.
 */
export type TextConnectionEditorProps = {
  mode: "create" | "edit";
  /** The connection being edited (null while creating). */
  editing: ProviderConnection | null;
  form: ProviderConnectionPayload;
  setForm: Dispatch<SetStateAction<ProviderConnectionPayload>>;
  apiKey: ApiKeyFieldProps;
  /** Models from the last probe, with its status. */
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
};

export function TextConnectionEditor({
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
  onDelete
}: TextConnectionEditorProps) {
  return (
    <form className="conn-editor conn-editor-card" onSubmit={onSubmit}>
      <div className="conn-editor-header">
        <h4>{mode === "create" ? "New Provider Connection" : `Edit: ${editing?.label ?? ""}`}</h4>
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
              placeholder="e.g. Local LM Studio"
            />

            <TextInput
              label="Base URL"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="http://localhost:1234/v1"
              leftIcon={<Icon name="Globe" size={14} />}
            />
          </div>

          <ApiKeyField {...apiKey} />
        </div>
      </div>

      <div className="conn-section">
        <h5 className="form-section-title conn-section-title">
          <Icon name="Cpu" size={14} />
          <span>Model Configuration</span>
        </h5>
        <div className="conn-fields-group">
          <div>
            <TextInput
              label="Model ID"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="e.g. llama-3"
              leftIcon={<Icon name="Cpu" size={14} />}
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
                    icon: <Icon name="Cpu" size={13} />,
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
          <Icon name="Sliders" size={14} />
          <span>Generation Parameters</span>
        </h5>
        <div className="settings-grid-3">
          <TextInput
            label="Temperature"
            type="number"
            step="0.1"
            placeholder="0.8"
            helperText="Sampling temperature (0.0 – 2.0)"
            value={form.temperature}
            onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
          />
          <TextInput
            label="Max Tokens"
            type="number"
            placeholder="1200"
            helperText="Max output tokens per turn"
            value={form.maxTokens}
            onChange={(e) => setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))}
          />
          <TextInput
            label="Context Window"
            type="number"
            placeholder="32768"
            helperText="Token budget (e.g. 32768)"
            value={form.contextWindow}
            onChange={(e) => setForm((f) => ({ ...f, contextWindow: Number(e.target.value) }))}
          />
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
