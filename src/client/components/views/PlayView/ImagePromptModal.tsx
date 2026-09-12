import { useEffect, useState } from "react";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../../../../engine/imageDefaults";
import type { ImageApiStyle } from "../../../../schemas";
import { CLIP_CHUNK_TOKENS, chunkWarning, estimatePromptChunks } from "../../../utils/imagePromptEstimate";
import { Button, Icon, TextArea } from "../../base";

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
    apiStyle,
    onGenerate,
    onRerun,
    onClose
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
    <div className="modal-backdrop">
      <section className="modal module-edit-modal image-prompt-modal" role="dialog" aria-label="Review image prompt">
        <header className="modal-header">
          <div>
            <h2>Review Image Prompt</h2>
            <p className="image-prompt-subtitle">
              Written by the text model, sent to the image provider verbatim — edit it and the image
              model gets your text (the text model is not called a second time).
            </p>
          </div>
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            onClick={onClose}
            leftIcon={<Icon name="X" size={14} />}
            title="Close without generating"
            aria-label="Close without generating"
          />
        </header>

        <div className="settings-form image-prompt-form">
          {/* Advisory, never blocking: the text below is editable and still
              Generates. Surfaced here so a refusal or a key-less JSON answer is
              seen BEFORE the image call is paid for. */}
          {warnings.length > 0 ? (
            <div className="image-prompt-warnings" role="status">
              {warnings.map((warning) => (
                <p key={warning} className="image-prompt-warning">
                  <Icon name="AlertTriangle" size={13} className="image-prompt-warning-icon" />
                  <span>{warning}</span>
                </p>
              ))}
            </div>
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
            containerClassName={overLimit ? "image-prompt-over-limit" : undefined}
            helperText={
              overLimit
                ? `Over the ${limit}-character limit — the server clamps the composed prompt before sending.`
                : undefined
            }
          />
          {/* Prompt-length estimate, a1111 only. Advisory: it changes nothing
              about what is sent — the text below is posted verbatim. */}
          {estimate ? (
            <div className="image-prompt-estimate" role="status">
              <p className="image-prompt-estimate-line">
                <Icon name="Ruler" size={13} className="image-prompt-estimate-icon" />
                <span>
                  About <strong>{estimate.tokens}</strong> tokens — {estimate.chunks} CLIP chunk
                  {estimate.chunks === 1 ? "" : "s"} of {CLIP_CHUNK_TOKENS}.{" "}
                  {estimate.chunks === 1
                    ? "The whole prompt fits the first chunk."
                    : "Everything past the first chunk is weighted less."}
                </span>
              </p>
              {estimateWarning ? (
                <p className="image-prompt-estimate-warning">
                  <Icon name="AlertTriangle" size={13} className="image-prompt-warning-icon" />
                  <span>{estimateWarning}</span>
                </p>
              ) : null}
              <p className="image-prompt-estimate-note">
                An approximation (~4 characters per token), not a tokenizer — and never a limit: the text is
                sent unchanged.
              </p>
            </div>
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

          {caption ? <p className="image-prompt-caption">Image provider: {caption}</p> : null}

          <div className="settings-actions image-prompt-actions">
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
              variant="secondary"
              onClick={onClose}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="image-prompt-rerun"
              onClick={onRerun}
              disabled={busy}
              isLoading={rerunning}
              leftIcon={<Icon name="RefreshCw" size={12} />}
              title="Ask the text model for a fresh draft (replaces the text above)"
            >
              Re-run text call
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
