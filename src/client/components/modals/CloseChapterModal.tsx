import { useEffect, useMemo, useRef, useState } from "react";
import {
  getChapterOpeningMode,
  listProviderConnections,
  setChapterOpeningMode,
  setChapterTextProvider,
  type CloseChapterBody,
  type ProviderConnection
} from "../../api";
import { CHAPTER_OPENING_MODES, chapterOpeningModeInfo, chapterOpeningModeNeedsMessage } from "../../../engine/chapterLifecycle";
import type { ChapterOpeningMode } from "../../../schemas";
import { Button, Icon, SimpleSelect, TextArea } from "../base";
import { Dialog } from "../base/Dialog";

export type CloseChapterModalProps = {
  /** How many visible messages the running chapter holds — the operation's own gate already ran,
   *  this is for the copy. */
  visibleMessageCount: number;
  isLoading: boolean;
  /** Why the last close attempt failed, shown in place. */
  errorMessage?: string | null;
  onConfirm: (body: CloseChapterBody) => void;
  onCancel: () => void;
};

/**
 * Closing a chapter, as a real dialog on the shared modal contract rather than the bespoke
 * surface the Journal used to carry inline (whose CSS lived in two stylesheets).
 *
 * It asks two things: an optional closing note, and **which text connection writes it** — the
 * summary and the chapter opening alike, because closing is one user action that happens to make
 * two model calls. The choice is remembered (the provider registry), so the next chapter offers
 * the same connection; an empty choice means "follow the active connection".
 */
export function CloseChapterModal({
  visibleMessageCount,
  isLoading,
  errorMessage,
  onConfirm,
  onCancel
}: CloseChapterModalProps) {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [activeTextProviderId, setActiveTextProviderId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChapterOpeningMode>("continuation");
  const [modeError, setModeError] = useState<string | null>(null);
  const [openingMessage, setOpeningMessage] = useState("");
  // The shell moves focus itself; for a destructive write the safe answer holds it.
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The remembered mode, like the remembered connection below: one read on open, one write on
    // change, and a failure to read falls back to the mode that changes nothing.
    getChapterOpeningMode()
      .then((preference) => {
        if (!cancelled) setMode(preference.chapterOpeningMode);
      })
      .catch(() => {
        /* Fall back to `continuation` — the mode that behaves as it did before modes existed. */
      });
    listProviderConnections()
      .then((registry) => {
        if (cancelled) return;
        setConnections(registry.connections.filter((connection) => connection.kind === "text"));
        setActiveTextProviderId(registry.activeTextProviderId ?? "");
        setProviderId(registry.chapterTextProviderId ?? "");
      })
      .catch(() => {
        /* No registry to read is not a failure: the select simply offers the active connection. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const rows = connections.map((connection) => ({
      value: connection.id,
      label: `${connection.label}${connection.model ? ` — ${connection.model}` : ""}${
        connection.id === activeTextProviderId ? " (active)" : ""
      }`
    }));
    // A stored choice whose connection is gone stays selectable so it can be re-pointed, and the
    // request still runs — resolution falls back to the active connection at use time.
    if (providerId && !connections.some((connection) => connection.id === providerId)) {
      rows.push({ value: providerId, label: `${providerId} (not found)` });
    }
    return [{ value: "", label: "Active connection" }, ...rows];
  }, [connections, activeTextProviderId, providerId]);

  function handleModeChange(next: ChapterOpeningMode) {
    setMode(next);
    setModeError(null);
    setChapterOpeningMode(next).catch((error: unknown) => {
      setModeError(error instanceof Error ? error.message : "Could not remember that mode");
    });
  }

  function handleProviderChange(id: string) {
    setProviderId(id);
    setProviderError(null);
    // Persisted as soon as it is chosen, like the New Playthrough field: the preference must
    // survive a cancelled dialog, and no preference write is coupled to the close itself.
    setChapterTextProvider(id === "" ? null : id).catch((error: unknown) => {
      setProviderError(error instanceof Error ? error.message : "Could not save that connection");
    });
  }

  // Escape, the backdrop, the focus and the dialog semantics all come from the shell now.
  return (
    <Dialog
      title="Close Chapter"
      className="close-chapter-modal"
      onClose={onCancel}
      isBusy={isLoading}
      initialFocusRef={cancelRef}
      headerAction={
        <button className="flex items-center gap-1 modal-close-btn" onClick={onCancel} aria-label="Close">
          <Icon name="X" size={14} /> Close
        </button>
      }
      description={
        <>
          {visibleMessageCount} message{visibleMessageCount === 1 ? "" : "s"} in the running chapter become
          an archived volume: the model writes a name, a one-line description and a full summary, then
          opens the next chapter. The transcript and the memories stay.
        </>
      }
      footer={
        <>
          <Button
            variant="primary"
            size="md"
            disabled={isLoading || (chapterOpeningModeNeedsMessage(mode) && !openingMessage.trim())}
            isLoading={isLoading}
            onClick={() =>
              onConfirm({
                openingMode: mode,
                ...(openingMessage.trim() ? { openingMessage: openingMessage.trim() } : {}),
                ...(providerId ? { providerId } : {})
              })
            }
          >
            {isLoading ? "Closing & Summarizing…" : "Confirm & Close"}
          </Button>
          <Button ref={cancelRef} variant="secondary" size="md" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="form-field">
        <span className="field-label-text">Text Provider</span>
        <SimpleSelect
          id="close-chapter-provider"
          size="sm"
          variant="filled"
          fullWidth
          value={providerId}
          onChange={handleProviderChange}
          options={options}
          placeholder="Active connection"
          aria-label="Text provider"
        />
        <span className="field-hint">
          Writes the summary and the chapter opening. Remembered for the next chapter.
        </span>
        {providerError ? <span className="field-hint error">{providerError}</span> : null}
      </div>

      <div className="form-field">
        <span className="field-label-text">How the next chapter opens</span>
        <SimpleSelect<ChapterOpeningMode>
          id="close-chapter-mode"
          size="sm"
          variant="filled"
          fullWidth
          value={mode}
          onChange={handleModeChange}
          options={CHAPTER_OPENING_MODES.map((entry) => ({ value: entry.id, label: entry.label }))}
          aria-label="How the next chapter opens"
        />
        <span className="field-hint">{chapterOpeningModeInfo(mode).blurb}</span>
        {modeError ? <span className="field-hint error">{modeError}</span> : null}
      </div>

      {/* The player's own message for the new chapter. It is a normal user message there — the
          chapter's first — so it stays editable and re-readable like any other. */}
      <div className="form-field">
        <label className="field-label-text" htmlFor="close-chapter-message">
          Opening message{chapterOpeningModeNeedsMessage(mode) ? "" : " (optional)"}
        </label>
        <TextArea
          id="close-chapter-message"
          value={openingMessage}
          onChange={(event) => setOpeningMessage(event.target.value)}
          placeholder="Becomes the first message of the new chapter — a transition, a time skip, a first line. Leave it empty to let the connection open the scene alone."
          rows={3}
          aria-describedby="close-chapter-message-hint"
        />
        <span className="field-hint" id="close-chapter-message-hint">
          {chapterOpeningModeNeedsMessage(mode)
            ? "This mode follows your message exactly, so it needs one."
            : "The new chapter starts with it, and a Retry on the opening keeps it."}
        </span>
      </div>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
    </Dialog>
  );
}
