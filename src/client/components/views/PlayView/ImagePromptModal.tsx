import { useEffect, useState } from "react";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../../../../engine/imageDefaults";
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
  onGenerate: (prompt: string, negativePrompt: string) => void;
  onRerun: () => void;
  onClose: () => void;
};

export function ImagePromptModal(props: ImagePromptModalProps) {
  const {
    prompt,
    negativePrompt,
    providerLabel,
    model,
    characterLimit = DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit,
    generating,
    rerunning,
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
          <TextArea
            label="Negative Prompt"
            value={negativeDraft}
            onChange={(e) => setNegativeDraft(e.target.value)}
            rows={4}
            disabled={generating}
            characterCount={negativeDraft.length}
            maxCharacterCount={limit}
            helperText="Dropped entirely by the OpenAI-compatible dialect, which has no negative prompt."
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
