import { useEffect, useMemo, useState } from "react";
import type { ImageApiStyle, MessageImage } from "../../../../schemas";
import { imageCaption } from "../../../engine/displayFormat";
import {
  CLIP_CHUNK_TOKENS,
  chunkWarning,
  estimatePromptChunks,
} from "../../../utils/imagePromptEstimate";
import {
  checkImageRequestBody,
  formatImageRequestBody,
  updateImageRequestField,
} from "../../../utils/imageRequestBody";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  IconButton,
  Modal,
  Stack,
  StatusMessage,
  Tabs,
  type TabItem,
  Text,
  TextArea,
  TextInput,
} from "../../base";
import { ConfirmModal } from "../../common";

/** What the editor knows about the connection the image was made with. Null when
 *  that connection no longer exists — the body can still be SAVED (a save renders
 *  nothing and needs no provider at all), but the re-send it is preparing for
 *  cannot be aimed anywhere, so the editor says so. */
export type ImageRequestBodyConnection = {
  label: string;
  model: string;
  apiStyle: ImageApiStyle;
} | null;

export type ImageRequestBodyModalProps = {
  /** The stored body, pretty-printed — what the field is seeded with, and what
   *  Reset restores. */
  body: string;
  connection: ImageRequestBodyConnection;
  /** Optional image metadata for the provenance header inside the editor. */
  image?: MessageImage;
  /** A save is in flight. */
  saving: boolean;
  /** Save the body without rendering. Returns the reason when it could not be
   *  saved, so the editor KEEPS the typed text and shows why. */
  onSave: (body: string) => Promise<string | null>;
  /** Save the body and immediately trigger the replace/re-send workflow. */
  onResend?: (body: string) => Promise<string | null>;
  /** Send the body to generate a new image variant without replacing the old one. */
  onGenerateNew?: (body: string) => Promise<string | null>;
  onClose: () => void;
};

type EditorTabId = "structured" | "json";

const EDITOR_TABS: TabItem<EditorTabId>[] = [
  { id: "structured", label: "Structured Fields" },
  { id: "json", label: "Raw JSON" },
];

const DIALECT_NOTES: Record<ImageApiStyle, string> = {
  a1111:
    "When re-sent, this goes to the WebUI's /sdapi/v1/txt2img. steps, cfg_scale, sampler_name, scheduler, width/height and the checkpoint are whatever this body says — the connection's own values are not re-applied.",
  venice:
    "When re-sent, this goes to /image/generate. variants, seed, style_preset, aspect_ratio and safe_mode are whatever this body says — an empty field is omitted rather than sent as an empty value.",
  openai:
    "When re-sent, this goes to /images/generations. This dialect has no negative prompt, and the endpoint rejects a prompt over 1500 characters with its own error.",
};

/**
 * The request-body editor: lets the user inspect and edit an image's stored
 * JSON request body either via structured fields (prompt, negative prompt,
 * seed, dimensions, sampling parameters) or raw JSON, and then Save Only,
 * Save & Replace, or Generate as a New Variant.
 */
export function ImageRequestBodyModal(props: ImageRequestBodyModalProps) {
  const {
    body,
    connection,
    image,
    saving,
    onSave,
    onResend,
    onGenerateNew,
    onClose,
  } = props;

  const [draft, setDraft] = useState(body);
  const [activeTab, setActiveTab] = useState<EditorTabId>("structured");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [copied, setCopied] = useState(false);

  // Adopt a fresh seed (a different image's body, or the saved one) without
  // clobbering keystrokes in between.
  useEffect(() => {
    setDraft(body);
    setSaveError(null);
  }, [body]);

  const dirty = draft !== body;
  const check = useMemo(() => checkImageRequestBody(draft), [draft]);
  const parsed = check.ok ? check.value : null;

  const apiStyle = connection?.apiStyle;
  const isA1111 =
    apiStyle === "a1111" ||
    Boolean(parsed && ("sampler_name" in parsed || "cfg_scale" in parsed));
  const isVenice =
    apiStyle === "venice" ||
    Boolean(parsed && ("style_preset" in parsed || "safe_mode" in parsed));

  const promptValue =
    parsed && typeof parsed.prompt === "string" ? parsed.prompt : "";
  const negativeValue =
    parsed && typeof parsed.negative_prompt === "string"
      ? parsed.negative_prompt
      : "";
  const showNegative =
    isA1111 || isVenice || Boolean(parsed && "negative_prompt" in parsed);

  const estimate = isA1111 && parsed ? estimatePromptChunks(promptValue) : null;
  const estimateWarning = isA1111 && parsed ? chunkWarning(promptValue) : null;

  /** Update a single field on the JSON draft. */
  function setField(key: string, value: unknown) {
    setDraft((prev) => updateImageRequestField(prev, key, value));
    setSaveError(null);
  }

  /** Parse numeric input: empty string removes the key, valid number updates it. */
  function handleNumberField(
    key: string,
    raw: string,
    opts: { float?: boolean } = {},
  ) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setField(key, undefined);
      return;
    }
    const num = opts.float
      ? Number.parseFloat(trimmed)
      : Number.parseInt(trimmed, 10);
    if (!Number.isNaN(num)) {
      setField(key, num);
    }
  }

  function rollRandomSeed() {
    const nextSeed = Math.floor(Math.random() * 2_147_483_647) + 1;
    setField("seed", nextSeed);
  }

  function setProviderRandomSeed() {
    setField("seed", isA1111 ? -1 : 0);
  }

  /** Every close path goes through here, so none of them can drop a hand-edit
   *  without asking. Saving does not come through here — its edits are kept. */
  function attemptClose() {
    if (saving) return;
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  async function handleSave() {
    const error = await onSave(draft);
    setSaveError(error);
  }

  async function handleResend() {
    if (!onResend) return;
    const error = await onResend(draft);
    setSaveError(error);
  }

  async function handleGenerateNew() {
    if (!onGenerateNew) return;
    const error = await onGenerateNew(draft);
    setSaveError(error);
  }

  function handleCopy() {
    void navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleFormatJson() {
    setDraft((prev) => formatImageRequestBody(prev));
  }

  return (
    <>
      <Modal
        open
        size="lg"
        ariaLabel="Edit image request"
        dismissDisabled={saving || confirmingDiscard}
        onClose={attemptClose}
      >
        <Header
          variant="modal"
          title="Edit Image Request"
          subtitle="Adjust the prompt, seed, or sampling parameters sent to the image provider — then Save & Replace, Generate as a New Variant, or Save Only."
          actions={
            <IconButton
              variant="ghost"
              size="sm"
              icon="X"
              label="Close the editor"
              title="Close the editor"
              onClick={attemptClose}
            />
          }
        />

        <Modal.Body>
          <Modal.Content>
            <Stack direction="column" align="stretch" gap="md" fullWidth>
              {/* Image & Provider Provenance Summary Card */}
              {image || connection ? (
                <Card variant="panel" padding="sm" fullWidth>
                  <Stack direction="column" align="stretch" gap="2xs" fullWidth>
                    {image ? (
                      <Text size="xs" weight="semibold" mono>
                        {imageCaption(image)}
                      </Text>
                    ) : null}
                    {connection ? (
                      <Text size="xs" tone="muted">
                        Image provider: <strong>{connection.label}</strong> ·{" "}
                        {connection.model} ({connection.apiStyle})
                      </Text>
                    ) : null}
                  </Stack>
                </Card>
              ) : null}

              {!connection ? (
                <StatusMessage variant="banner" tone="warn">
                  The connection this image was made with no longer exists. The
                  body can still be saved, but a re-send has nowhere to go until
                  it is restored.
                </StatusMessage>
              ) : null}

              {/* Mode Switcher + JSON Validity Status */}
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                wrap
                fullWidth
              >
                <Tabs<EditorTabId>
                  tabs={EDITOR_TABS}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  variant="segmented"
                  size="sm"
                />

                <Stack direction="row" align="center" gap="xs">
                  {dirty ? (
                    <Badge variant="warning" size="xs">
                      Modified
                    </Badge>
                  ) : null}
                  <Badge variant={check.ok ? "success" : "danger"} size="xs">
                    {check.ok ? "Valid JSON" : "Invalid JSON"}
                  </Badge>
                  {activeTab === "json" && check.ok ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleFormatJson}
                      disabled={saving}
                      leftIcon={<Icon name="AlignLeft" size={11} />}
                      title="Pretty-print the JSON body"
                    >
                      Format
                    </Button>
                  ) : null}
                </Stack>
              </Stack>

              {saveError ? (
                <StatusMessage variant="banner" tone="err">
                  {saveError}
                </StatusMessage>
              ) : null}

              {activeTab === "structured" ? (
                parsed ? (
                  <Stack direction="column" align="stretch" gap="md" fullWidth>
                    <TextArea
                      label="Prompt"
                      value={promptValue}
                      onChange={(e) => setField("prompt", e.target.value)}
                      rows={6}
                      autoGrow
                      autoGrowMax={240}
                      disabled={saving}
                      characterCount={promptValue.length}
                    />

                    {estimate ? (
                      <Card padding="sm" role="status" fullWidth>
                        <Stack
                          direction="column"
                          align="stretch"
                          gap="xs"
                          fullWidth
                        >
                          <Stack direction="row" align="center" gap="xs">
                            <Icon
                              name="Ruler"
                              size={13}
                              className="ds-icon-accent"
                            />
                            <Text as="span" size="xs" tone="secondary">
                              About <strong>{estimate.tokens}</strong> tokens —{" "}
                              {estimate.chunks} CLIP chunk
                              {estimate.chunks === 1 ? "" : "s"} of{" "}
                              {CLIP_CHUNK_TOKENS}.{" "}
                              {estimate.chunks === 1
                                ? "The whole prompt fits the first chunk."
                                : "Everything past the first chunk is weighted less."}
                            </Text>
                          </Stack>
                          {estimateWarning ? (
                            <StatusMessage variant="inline" tone="warn">
                              {estimateWarning}
                            </StatusMessage>
                          ) : null}
                        </Stack>
                      </Card>
                    ) : null}

                    {showNegative ? (
                      <TextArea
                        label="Negative Prompt"
                        value={negativeValue}
                        onChange={(e) =>
                          setField(
                            "negative_prompt",
                            e.target.value || undefined,
                          )
                        }
                        rows={3}
                        autoGrow
                        autoGrowMax={160}
                        disabled={saving}
                        characterCount={negativeValue.length}
                      />
                    ) : null}

                    <FormGrid cols={3} gap="sm">
                      <TextInput
                        label="Seed"
                        type="number"
                        size="sm"
                        disabled={saving}
                        value={
                          typeof parsed.seed === "number"
                            ? String(parsed.seed)
                            : ""
                        }
                        placeholder={isA1111 ? "-1 (random)" : "0 (random)"}
                        onChange={(e) =>
                          handleNumberField("seed", e.target.value)
                        }
                        rightElement={
                          <Stack direction="row" align="center" gap="xs">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={rollRandomSeed}
                              disabled={saving}
                              leftIcon={<Icon name="Dices" size={12} />}
                              title="Roll a random fixed seed"
                            >
                              Roll
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={setProviderRandomSeed}
                              disabled={saving}
                              title={
                                isA1111
                                  ? "Set seed to -1 (WebUI picks a random seed)"
                                  : "Set seed to 0 (provider picks a random seed)"
                              }
                            >
                              Auto
                            </Button>
                          </Stack>
                        }
                      />

                      {(isA1111 || isVenice || "width" in parsed) && (
                        <TextInput
                          label="Width"
                          type="number"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.width === "number"
                              ? String(parsed.width)
                              : ""
                          }
                          onChange={(e) =>
                            handleNumberField("width", e.target.value)
                          }
                        />
                      )}

                      {(isA1111 || isVenice || "height" in parsed) && (
                        <TextInput
                          label="Height"
                          type="number"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.height === "number"
                              ? String(parsed.height)
                              : ""
                          }
                          onChange={(e) =>
                            handleNumberField("height", e.target.value)
                          }
                        />
                      )}

                      {(isA1111 || "steps" in parsed) && (
                        <TextInput
                          label="Steps"
                          type="number"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.steps === "number"
                              ? String(parsed.steps)
                              : ""
                          }
                          onChange={(e) =>
                            handleNumberField("steps", e.target.value)
                          }
                        />
                      )}

                      {(isA1111 || "cfg_scale" in parsed) && (
                        <TextInput
                          label="CFG Scale"
                          type="number"
                          step="0.5"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.cfg_scale === "number"
                              ? String(parsed.cfg_scale)
                              : ""
                          }
                          onChange={(e) =>
                            handleNumberField("cfg_scale", e.target.value, {
                              float: true,
                            })
                          }
                        />
                      )}

                      {(isA1111 || "sampler_name" in parsed) && (
                        <TextInput
                          label="Sampler"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.sampler_name === "string"
                              ? parsed.sampler_name
                              : ""
                          }
                          onChange={(e) =>
                            setField(
                              "sampler_name",
                              e.target.value || undefined,
                            )
                          }
                        />
                      )}

                      {(isA1111 || "scheduler" in parsed) && (
                        <TextInput
                          label="Scheduler"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.scheduler === "string"
                              ? parsed.scheduler
                              : ""
                          }
                          onChange={(e) =>
                            setField("scheduler", e.target.value || undefined)
                          }
                        />
                      )}

                      {(isVenice || "style_preset" in parsed) && (
                        <TextInput
                          label="Style Preset"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.style_preset === "string"
                              ? parsed.style_preset
                              : ""
                          }
                          placeholder="None"
                          onChange={(e) =>
                            setField(
                              "style_preset",
                              e.target.value || undefined,
                            )
                          }
                        />
                      )}

                      {(isVenice || "variants" in parsed) && (
                        <TextInput
                          label="Variants"
                          type="number"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.variants === "number"
                              ? String(parsed.variants)
                              : ""
                          }
                          onChange={(e) =>
                            handleNumberField("variants", e.target.value)
                          }
                        />
                      )}

                      {(!isA1111 && !isVenice) || "size" in parsed ? (
                        <TextInput
                          label="Size"
                          size="sm"
                          disabled={saving}
                          value={
                            typeof parsed.size === "string" ? parsed.size : ""
                          }
                          placeholder="1024x1024"
                          onChange={(e) =>
                            setField("size", e.target.value || undefined)
                          }
                        />
                      ) : null}
                    </FormGrid>
                  </Stack>
                ) : (
                  <StatusMessage variant="banner" tone="warn">
                    <Stack
                      direction="column"
                      align="stretch"
                      gap="xs"
                      fullWidth
                    >
                      <Text size="xs">
                        {!check.ok
                          ? check.error
                          : "The request body is not valid JSON."}
                      </Text>
                      <Stack direction="row" gap="xs">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setActiveTab("json")}
                        >
                          Switch to Raw JSON to fix
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setDraft(body);
                            setSaveError(null);
                          }}
                        >
                          Reset to stored body
                        </Button>
                      </Stack>
                    </Stack>
                  </StatusMessage>
                )
              ) : (
                <TextArea
                  label="Request body (JSON)"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setSaveError(null);
                  }}
                  rows={16}
                  disabled={saving}
                  mono
                  error={!check.ok ? check.error : undefined}
                  helperText={
                    check.ok
                      ? "Saved as one line of JSON. No field is clamped or stripped — what is here is sent verbatim."
                      : undefined
                  }
                />
              )}

              {connection ? (
                <Text size="xs" tone="muted">
                  {DIALECT_NOTES[connection.apiStyle]}
                </Text>
              ) : null}
            </Stack>
          </Modal.Content>
        </Modal.Body>

        <Modal.Footer>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            wrap
            fullWidth
          >
            <Stack direction="row" align="center" gap="sm" wrap>
              {onResend ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void handleResend()}
                  disabled={saving || !check.ok || !connection}
                  isLoading={saving}
                  leftIcon={<Icon name="RefreshCw" size={12} />}
                  title="Save this request body and re-send it to replace the current image"
                >
                  Save & Replace
                </Button>
              ) : null}
              {onGenerateNew ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleGenerateNew()}
                  disabled={saving || !check.ok || !connection}
                  leftIcon={<Icon name="Image" size={13} />}
                  title="Send this request body to render a new image variant alongside the existing one"
                >
                  Generate as New
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={onResend ? "ghost" : "primary"}
                onClick={() => void handleSave()}
                disabled={saving || !check.ok || !dirty}
                isLoading={!onResend && saving}
                leftIcon={<Icon name="Save" size={13} />}
                title="Save the edited JSON to the stored image without rendering now"
              >
                {onResend ? "Save Only" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(body);
                  setSaveError(null);
                }}
                disabled={saving || !dirty}
                leftIcon={<Icon name="RotateCcw" size={12} />}
                title="Restore the stored body, discarding your edits"
              >
                Reset
              </Button>
            </Stack>

            <Stack direction="row" align="center" gap="sm" wrap>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                disabled={saving}
                leftIcon={<Icon name={copied ? "Check" : "Copy"} size={12} />}
                title="Copy this JSON body to clipboard"
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={attemptClose}
                disabled={saving}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Modal.Footer>
      </Modal>

      {confirmingDiscard ? (
        <ConfirmModal
          title="Discard your edits?"
          message="The stored request body stays as it is, and the image is untouched. Save instead to keep what you typed."
          confirmLabel="Discard edits"
          cancelLabel="Keep editing"
          danger
          maxWidth={420}
          onConfirm={onClose}
          onCancel={() => setConfirmingDiscard(false)}
        />
      ) : null}
    </>
  );
}
