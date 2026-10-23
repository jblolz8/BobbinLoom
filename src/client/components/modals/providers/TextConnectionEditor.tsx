import { useEffect, useState, type Dispatch, type FormEvent, type MouseEvent, type SetStateAction } from "react";
import { Badge, Button, Card, FormGrid, FormSection, Icon, SimpleSelect, TextInput } from "../../base";
import type { ProviderConnection, ProviderConnectionPayload } from "../../../api";
import type { TextJsonMode } from "../../../../schemas";
import { ApiKeyField, type ApiKeyFieldProps } from "./ApiKeyField";
import { EditorActionBar } from "./EditorActionBar";

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

function optionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function clearableNumber(raw: string): number | null {
  const value = optionalNumber(raw);
  return value === undefined ? null : value;
}

function clearableInt(raw: string): number | null {
  const value = optionalNumber(raw);
  return value === undefined ? null : Math.max(1, Math.round(value));
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
  /** The form differs from what was loaded/saved. Gates Save in EDIT mode: a
   *  create form is seeded from its own baseline, so gating that too would make a
   *  new connection unsaveable. */
  dirty: boolean;
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
  dirty,
  onSubmit,
  onTest,
  onCancel,
  onDelete
}: TextConnectionEditorProps) {
  const [stopDraft, setStopDraft] = useState(() => formatStopSequences(form.stop));
  const activeSamplerCount = [
    form.topP,
    form.minP,
    form.topK,
    form.frequencyPenalty,
    form.presencePenalty,
    form.repetitionPenalty
  ].filter((v) => v != null).length;

  useEffect(() => {
    setStopDraft(formatStopSequences(form.stop));
  }, [editing?.id, mode]);

  return (
    <Card as="form" variant="elevated" padding="md" className="conn-editor" onSubmit={onSubmit}>
      <div className="conn-editor-header">
        <h4>{mode === "create" ? "New Provider Connection" : `Edit: ${editing?.label ?? ""}`}</h4>
      </div>

      <FormSection icon="Plug" title="Connection & Model">
        <FormGrid cols="2-asymmetric">
          <TextInput
            label="Name"
            size="sm"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Local LM Studio"
          />

          <TextInput
            label="Base URL"
            size="sm"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="http://localhost:1234/v1"
            leftIcon={<Icon name="Globe" size={13} />}
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
              placeholder="e.g. llama-3"
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
                    setForm((f) => ({ ...f, model: selectedModel }));
                  }
                }}
                placeholder={`Select fetched model (${models.length})…`}
                options={models.map((m) => ({
                  value: m,
                  label: m,
                  icon: <Icon name="Cpu" size={12} />,
                }))}
              />
            )}
            {modelsStatus && <p className={`conn-status ${modelsStatus.kind}`}>{modelsStatus.text}</p>}
          </div>
        </FormGrid>
      </FormSection>

      <FormSection icon="Sliders" title="Generation Parameters">
        <FormGrid cols={4}>
          <TextInput
            label="Temp (0–2)"
            size="sm"
            type="number"
            min={0}
            max={2}
            step="0.05"
            placeholder="0.8"
            value={form.temperature === undefined || form.temperature === null ? "" : String(form.temperature)}
            onChange={(e) => setForm((f) => ({ ...f, temperature: optionalNumber(e.target.value) }))}
          />
          <TextInput
            label="Max Tokens"
            size="sm"
            type="number"
            min={1}
            placeholder="1200"
            value={form.maxTokens === undefined || form.maxTokens === null ? "" : String(form.maxTokens)}
            onChange={(e) => setForm((f) => ({ ...f, maxTokens: optionalNumber(e.target.value) }))}
          />
          <TextInput
            label="Context Window"
            size="sm"
            type="number"
            min={512}
            placeholder="32768"
            value={form.contextWindow === undefined || form.contextWindow === null ? "" : String(form.contextWindow)}
            onChange={(e) => setForm((f) => ({ ...f, contextWindow: optionalNumber(e.target.value) }))}
          />
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
        title="Sampling & Penalties (Optional)"
        collapsible
        defaultOpen={activeSamplerCount > 0}
        badge={
          activeSamplerCount > 0 ? (
            <Badge variant="accent" size="xs" pill>
              {activeSamplerCount} set
            </Badge>
          ) : undefined
        }
      >
        <FormGrid cols={3}>
          <TextInput
            label="Top P (0–1)"
            size="sm"
            type="number"
            min={0}
            max={1}
            step="0.01"
            placeholder="Default"
            value={form.topP === undefined || form.topP === null ? "" : String(form.topP)}
            onChange={(e) => setForm((f) => ({ ...f, topP: clearableNumber(e.target.value) }))}
          />
          <TextInput
            label="Min P (0–1)"
            size="sm"
            type="number"
            min={0}
            max={1}
            step="0.01"
            placeholder="Default"
            value={form.minP === undefined || form.minP === null ? "" : String(form.minP)}
            onChange={(e) => setForm((f) => ({ ...f, minP: clearableNumber(e.target.value) }))}
          />
          <TextInput
            label="Top K (≥1)"
            size="sm"
            type="number"
            min={1}
            step={1}
            placeholder="Default"
            value={form.topK === undefined || form.topK === null ? "" : String(form.topK)}
            onChange={(e) => setForm((f) => ({ ...f, topK: clearableInt(e.target.value) }))}
          />
          <TextInput
            label="Freq Penalty (-2–2)"
            size="sm"
            type="number"
            min={-2}
            max={2}
            step="0.05"
            placeholder="Default"
            value={form.frequencyPenalty === undefined || form.frequencyPenalty === null ? "" : String(form.frequencyPenalty)}
            onChange={(e) => setForm((f) => ({ ...f, frequencyPenalty: clearableNumber(e.target.value) }))}
          />
          <TextInput
            label="Pres Penalty (-2–2)"
            size="sm"
            type="number"
            min={-2}
            max={2}
            step="0.05"
            placeholder="Default"
            value={form.presencePenalty === undefined || form.presencePenalty === null ? "" : String(form.presencePenalty)}
            onChange={(e) => setForm((f) => ({ ...f, presencePenalty: clearableNumber(e.target.value) }))}
          />
          <TextInput
            label="Rep Penalty (0–3)"
            size="sm"
            type="number"
            min={0}
            max={3}
            step="0.01"
            placeholder="Default"
            value={form.repetitionPenalty === undefined || form.repetitionPenalty === null ? "" : String(form.repetitionPenalty)}
            onChange={(e) => setForm((f) => ({ ...f, repetitionPenalty: clearableNumber(e.target.value) }))}
          />
        </FormGrid>
      </FormSection>

      {testStatus && <p className={`conn-status ${testStatus.kind}`}>{testStatus.text}</p>}
      <EditorActionBar
        mode={mode}
        busy={busy}
        dirty={dirty}
        onTest={onTest}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </Card>
  );
}
