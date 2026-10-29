import { useEffect, useState } from "react";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../../../../engine/imageDefaults";
import type { ImageApiStyle, ImageInstructionMode } from "../../../../schemas";
import { formatDuration } from "../../../engine/displayFormat";
import {
  CLIP_CHUNK_TOKENS,
  chunkWarning,
  estimatePromptChunks,
} from "../../../utils/imagePromptEstimate";
import {
  Button,
  Card,
  Header,
  Icon,
  IconButton,
  Modal,
  Stack,
  StatusMessage,
  Text,
  TextArea,
} from "../../base";

/**
 * The review step between the text model writing an image prompt and the image
 * provider receiving it (`Settings → Chat → Review Image Prompt Before
 * Generating`, on by default).
 *
 * This component owns ONLY the editable text. The in-flight state, the abort
 * controller and the playthrough record live in `usePlaythrough`, so closing
 * this modal mid-flight can never leave the message's spinner stuck: the hook
 * still owns the request and clears it when the request settles.
 */
export type ImagePromptModalProps = {
  /** The prompt as the text model wrote it (already prefix-composed and
   *  clamped by the server, so what is shown is what will be sent). */
  prompt: string;
  negativePrompt: string;
  /** Advisory notes from the prompt-writing call — a suspected refusal used
   *  verbatim, or JSON that carried neither expected key. Shown above the
   *  editable prompt so the user sees them BEFORE pressing Generate. */
  warnings?: string[];
  /** Active image connection, for the provenance caption. */
  providerLabel?: string;
  model?: string;
  /** The preset's soft character limit, when the playthrough carries one.
   *  The server clamps to this AND to the dialect's hard cap; 0 reads as
   *  "unlimited" there. Absent → the shipped default. */
  characterLimit?: number;
  /** The image call is in flight (Generate pressed): edits stay on screen. */
  generating: boolean;
  /** The "Re-run text call" request is in flight. */
  rerunning: boolean;
  /** Live elapsed time of the in-flight text call, from the hook that owns the
   *  phase. Rendered while the re-run runs, so a slow provider looks slow
   *  instead of frozen. */
  promptElapsedMs?: number | null;
  /** Completed duration of the text call that wrote this prompt draft. */
  promptDurationMs?: number;
  /** What the dry run reported giving the prompt writer: how many messages of
   *  history it actually carried, and which perspective the instruction was read
   *  in. Diagnostic — it answers "why does this prompt look like that?" before the
   *  render is paid for. */
  context?: { historyMessages: number; instructionMode: ImageInstructionMode };
  /** Dialect of the connection that will render this prompt. Only `a1111`
   *  adds the CLIP chunk estimate — the other dialects have no equivalent
   *  published limit to warn about. */
  apiStyle?: ImageApiStyle;
  onGenerate: (prompt: string, negativePrompt: string) => void;
  onRerun: () => void;
  onClose: () => void;
};

export function ImagePromptModal(props: ImagePromptModalProps) {
  const {
    prompt,
    negativePrompt,
    warnings = [],
    providerLabel,
    model,
    characterLimit = DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit,
    generating,
    rerunning,
    promptElapsedMs = null,
    promptDurationMs,
    context,
    apiStyle,
    onGenerate,
    onRerun,
    onClose,
  } = props;

  const [promptDraft, setPromptDraft] = useState(prompt);
  const [negativeDraft, setNegativeDraft] = useState(negativePrompt);

  // Adopt a fresh draft (a re-run, or the first preview landing after open)
  // without clobbering keystrokes in between.
  useEffect(() => {
    setPromptDraft(prompt);
  }, [prompt]);
  useEffect(() => {
    setNegativeDraft(negativePrompt);
  }, [negativePrompt]);

  // 0 is the schema's "unlimited" and the server ignores it as a limit.
  const limit = characterLimit > 0 ? characterLimit : undefined;
  const overLimit = limit !== undefined && promptDraft.length > limit;
  const busy = generating || rerunning;

  const caption = [providerLabel, model].filter(Boolean).join(" · ");

  // The a1111 dialect is the one whose prompt length has a published
  // consequence — CLIP encodes 75 tokens per chunk and weights the tail less —
  // so the estimate is shown for it alone. Recomputed from the DRAFT, so the
  // numbers track edits as they are typed; never blocking, the prompt still
  // generates exactly as written.
  const a1111 = apiStyle === "a1111";
  const estimate = a1111 ? estimatePromptChunks(promptDraft) : null;
  const estimateWarning = a1111 ? chunkWarning(promptDraft) : null;

  return (
    <Modal
      open
      size="md"
      ariaLabel="Review image prompt"
      dismissDisabled={generating}
      onClose={onClose}
    >
      <Header
        variant="modal"
        title="Review Image Prompt"
        subtitle="Written by the text model, sent to the image provider verbatim — edit it and the image model gets your text (the text model is not called a second time)."
        actions={
          <IconButton
            variant="ghost"
            size="sm"
            icon="X"
            label="Close without generating"
            title="Close without generating"
            onClick={onClose}
          />
        }
      />

      <Modal.Body>
        <Modal.Content>
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            {/* Advisory, never blocking: the text below is editable and still
                Generates. Surfaced here so a refusal or a key-less JSON answer is
                seen BEFORE the image call is paid for. */}
            {warnings.length > 0 ? (
              <Stack
                direction="column"
                align="stretch"
                gap="xs"
                fullWidth
                role="status"
              >
                {warnings.map((warning) => (
                  <StatusMessage key={warning} variant="banner" tone="warn">
                    {warning}
                  </StatusMessage>
                ))}
              </Stack>
            ) : null}

            <TextArea
              label="Prompt"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={9}
              autoGrow
              autoGrowMax={320}
              disabled={generating}
              characterCount={promptDraft.length}
              maxCharacterCount={limit}
              overLimit={overLimit}
              helperText={
                overLimit
                  ? `Over the ${limit}-character limit — the server clamps the composed prompt before sending.`
                  : undefined
              }
            />

            {/* Prompt-length estimate, a1111 only. Advisory: it changes nothing
                about what is sent — the text below is posted verbatim. */}
            {estimate ? (
              <Card padding="sm" role="status" fullWidth>
                <Stack direction="column" align="stretch" gap="xs" fullWidth>
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="Ruler" size={13} className="ds-icon-accent" />
                    <Text as="span" size="xs" tone="secondary">
                      About <strong>{estimate.tokens}</strong> tokens —{" "}
                      {estimate.chunks} CLIP chunk
                      {estimate.chunks === 1 ? "" : "s"} of {CLIP_CHUNK_TOKENS}.{" "}
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
                  <Text size="xs" tone="muted">
                    An approximation (~4 characters per token), not a tokenizer
                    — and never a limit: the text is sent unchanged.
                  </Text>
                </Stack>
              </Card>
            ) : null}

            <TextArea
              label="Negative Prompt"
              value={negativeDraft}
              onChange={(e) => setNegativeDraft(e.target.value)}
              rows={4}
              disabled={generating}
              characterCount={negativeDraft.length}
              maxCharacterCount={limit}
              helperText={
                a1111
                  ? "Sent as negative_prompt — this dialect applies it, so put what you do not want here."
                  : "Dropped entirely by the OpenAI-compatible dialect, which has no negative prompt."
              }
            />

            {caption ? (
              <Text size="xs" tone="muted">
                Image provider: {caption}
              </Text>
            ) : null}

            {context || promptDurationMs !== undefined ? (
              <Text size="xs" tone="muted">
                {[
                  promptDurationMs !== undefined
                    ? `Prompt written in ${formatDuration(promptDurationMs)}`
                    : null,
                  context
                    ? context.historyMessages > 0
                      ? `Context: ${context.historyMessages} previous message${context.historyMessages === 1 ? "" : "s"}`
                      : "Context: this message only"
                    : null,
                  context
                    ? context.instructionMode === "scene"
                      ? "Scene instruction (third-person)"
                      : "POV instruction"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </Stack>
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        <Stack direction="row" align="center" gap="sm" wrap>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onGenerate(promptDraft, negativeDraft)}
            disabled={busy || !promptDraft.trim()}
            isLoading={generating}
            leftIcon={<Icon name="Image" size={13} />}
          >
            Generate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRerun}
            disabled={busy}
            isLoading={rerunning}
            leftIcon={<Icon name="RefreshCw" size={12} />}
            title="Ask the text model for a fresh draft (replaces the text above)"
          >
            Re-run text call
          </Button>
          {/* Cancel last: the row's order is a contract — the confirming action, then the secondary
              actions beside it, then the way out. */}
          <Button
            size="sm"
            variant="secondary"
            onClick={onClose}
            disabled={generating}
          >
            Cancel
          </Button>
          {rerunning && promptElapsedMs !== null ? (
            <Text as="span" size="xs" tone="muted" mono>
              {formatDuration(promptElapsedMs)}
            </Text>
          ) : !rerunning && promptDurationMs !== undefined ? (
            <Text
              as="span"
              size="xs"
              tone="muted"
              mono
              title="Time spent by the text model writing this image prompt"
            >
              prompt {formatDuration(promptDurationMs)}
            </Text>
          ) : null}
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
