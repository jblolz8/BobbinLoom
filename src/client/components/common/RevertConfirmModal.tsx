import { useMemo, useState } from "react";
import type { Playthrough } from "../../../schemas";
import { describeDeletion, planDeletion, planRevert, retryAnchorMessageId, toRevertAnchor, type RevertTarget } from "../../../engine/chapterRevert";
import { duplicatePlaythrough } from "../../api";
import { Button } from "../base";
import { ConfirmModal } from "./ConfirmModal";

/**
 * Which destructive rewind is being confirmed.
 *
 * A retry plans its deletion from the response's own user message and regenerates afterwards; a
 * revert plans it from the archived anchor and generates nothing. They share this dialog because they
 * ask the same question — how much goes — and one implementation of the facts block is what keeps the
 * two answers honest.
 */
export type RewindMode = "revert" | "retry";

export type RevertConfirmModalProps = {
  playthrough: Playthrough;
  /** The chapter or response being reverted to, or the response being replaced. For a retry only
   *  `id` is read; `label` is display-only and goes unused. */
  target: RevertTarget;
  mode?: RewindMode;
  /** The operation is in flight. A retry never sets this: its dialog closes on confirm and the turn
   *  runs inline in the chat, so this is the revert's own progress and the backup click's. */
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The guard in front of an irreversible revert.
 *
 * Two things make it honest rather than ominous: the numbers come from the SAME plan the server
 * executes (`planRevert` / `describeDeletion`), so the dialog cannot promise a smaller deletion than
 * the one that happens; and when the story has no restore point at that point it says so, because
 * the world state then stays as it is.
 *
 * **Duplicate as backup** is the only recovery path, and it is deliberately a separate click: the
 * copy runs on its own, reports itself, and leaves the dialog open. A failed copy can never ride
 * along with the destructive write.
 */
export function RevertConfirmModal({
  playthrough,
  target,
  mode = "revert",
  isLoading = false,
  onConfirm,
  onCancel
}: RevertConfirmModalProps) {
  const [backupState, setBackupState] = useState<{ kind: "idle" | "saving" | "done" | "error"; name?: string; error?: string }>({
    kind: "idle"
  });
  const isRetry = mode === "retry";

  // The plan the SERVER will execute, either way: a revert's anchor is the chapter or archived
  // message, a retry's is the user message that produced the response being replaced. Same planner,
  // same facts function, so neither dialog can promise a smaller deletion than the one that happens.
  const plan = useMemo(
    () =>
      isRetry
        ? (() => {
            const anchorId = retryAnchorMessageId(playthrough, target.id);
            return anchorId ? planDeletion(playthrough, anchorId) : null;
          })()
        : planRevert(playthrough, toRevertAnchor(target)),
    [playthrough, target, isRetry]
  );
  const facts = useMemo(() => (plan ? describeDeletion(plan, playthrough) : null), [plan, playthrough]);

  async function handleBackup() {
    setBackupState({ kind: "saving" });
    try {
      const copy = await duplicatePlaythrough(playthrough.id);
      setBackupState({ kind: "done", name: copy.name });
    } catch (error) {
      setBackupState({ kind: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  const title = isRetry
    ? "Retry this response?"
    : target.kind === "chapter"
      ? `Revert to “${target.label}”?`
      : "Revert from this response?";

  return (
    <ConfirmModal
      title={title}
      message={
        <>
          <p>
            {isRetry
              ? "The response and everything after it are discarded, the world state returns to how it was before that turn, and the same input runs again for a fresh result."
              : target.kind === "chapter"
                ? "Everything after this chapter is discarded, the chapter's messages return to the running story, and its summary is discarded."
                : "This response and everything after it are discarded. Your own message stays, so you can send it again or Retry."}
          </p>
          {facts ? (
            <ul className="revert-facts">
              <li>
                <strong>{facts.messages}</strong> message{facts.messages === 1 ? "" : "s"} deleted
              </li>
              <li>
                <strong>{facts.turns}</strong> turn{facts.turns === 1 ? "" : "s"} discarded
              </li>
              {/* A retry only ever anchors a live message, so it drops no chapter record: an "0
                  chapter records" line would be noise dressed up as a fact. */}
              {isRetry ? null : (
                <li>
                  <strong>{facts.chapters}</strong> chapter record{facts.chapters === 1 ? "" : "s"} discarded
                </li>
              )}
              {facts.images > 0 ? (
                <li>
                  <strong>{facts.images}</strong> image{facts.images === 1 ? "" : "s"} left unreferenced and
                  removed
                </li>
              ) : null}
            </ul>
          ) : null}
          {facts?.approximate ? (
            <p className="revert-approximate">
              {isRetry
                ? "This story has no restore point here, so the messages go while the world state stays as it is — the new response is written against the story as it stands now."
                : "This story has no restore point here, so the history and the chapters revert while the current world state stays as it is."}
            </p>
          ) : null}
          <p className="revert-noway-back">
            {isRetry
              ? "Nothing is written until the new response arrives, so a failed or cancelled retry leaves the story as it is. Once it lands, the discarded messages are gone and this cannot be undone."
              : "Background characters dropped when a chapter closed stay dropped, and this cannot be undone. Duplicate the playthrough first if you may want it back."}
          </p>
        </>
      }
      confirmLabel={isRetry ? "Retry this response" : isLoading ? "Reverting…" : "Revert"}
      danger
      isLoading={isLoading}
      confirmDisabled={!plan}
      maxWidth={520}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {/* The response being replaced is on screen right behind the dialog, so a preview of it would
          be telling the reader what they can already see. A revert's anchor is archived, so its text
          is the only place it appears. */}
      {target.kind === "message" && !isRetry ? (
        <blockquote className="retry-preview">
          {target.label.length > 200 ? `${target.label.slice(0, 200)}…` : target.label}
        </blockquote>
      ) : null}

      <div className="revert-backup-row">
        <Button
          variant="secondary"
          size="sm"
          disabled={backupState.kind === "saving" || isLoading}
          isLoading={backupState.kind === "saving"}
          onClick={() => { void handleBackup(); }}
        >
          {backupState.kind === "saving" ? "Copying…" : "Duplicate as backup"}
        </Button>
        {backupState.kind === "done" ? (
          <span className="revert-backup-note">Saved as “{backupState.name}” — it is on the shelf.</span>
        ) : null}
        {backupState.kind === "error" ? (
          <span className="revert-backup-note error">Copy failed: {backupState.error}</span>
        ) : null}
      </div>
    </ConfirmModal>
  );
}
