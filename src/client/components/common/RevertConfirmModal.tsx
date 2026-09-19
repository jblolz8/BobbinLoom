import { useMemo, useState } from "react";
import type { Playthrough } from "../../../schemas";
import { describeRevert, planRevert, toRevertAnchor, type RevertTarget } from "../../../engine/chapterRevert";
import { duplicatePlaythrough } from "../../api";
import { Button } from "../base";
import { ConfirmModal } from "./ConfirmModal";

export type RevertConfirmModalProps = {
  playthrough: Playthrough;
  target: RevertTarget;
  /** The revert itself is in flight. */
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The guard in front of an irreversible revert.
 *
 * Two things make it honest rather than ominous: the numbers come from the SAME plan the server
 * executes (`planRevert` / `describeRevert`), so the dialog cannot promise a smaller deletion than
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
  isLoading = false,
  onConfirm,
  onCancel
}: RevertConfirmModalProps) {
  const [backupState, setBackupState] = useState<{ kind: "idle" | "saving" | "done" | "error"; name?: string; error?: string }>({
    kind: "idle"
  });

  const plan = useMemo(() => planRevert(playthrough, toRevertAnchor(target)), [playthrough, target]);
  const facts = useMemo(() => (plan ? describeRevert(plan, playthrough) : null), [plan, playthrough]);

  async function handleBackup() {
    setBackupState({ kind: "saving" });
    try {
      const copy = await duplicatePlaythrough(playthrough.id);
      setBackupState({ kind: "done", name: copy.name });
    } catch (error) {
      setBackupState({ kind: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  const title =
    target.kind === "chapter" ? `Revert to “${target.label}”?` : "Revert from this response?";

  return (
    <ConfirmModal
      title={title}
      message={
        <>
          <p>
            {target.kind === "chapter"
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
              <li>
                <strong>{facts.chapters}</strong> chapter record{facts.chapters === 1 ? "" : "s"} discarded
              </li>
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
              This story has no restore point here, so the history and the chapters revert while the
              current world state stays as it is.
            </p>
          ) : null}
          <p className="revert-noway-back">
            Background characters dropped when a chapter closed stay dropped, and this cannot be undone.
            Duplicate the playthrough first if you may want it back.
          </p>
        </>
      }
      confirmLabel={isLoading ? "Reverting…" : "Revert"}
      danger
      isLoading={isLoading}
      confirmDisabled={!plan}
      maxWidth={520}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {target.kind === "message" ? (
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
