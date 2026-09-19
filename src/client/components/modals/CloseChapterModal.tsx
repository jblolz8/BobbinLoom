import { useEffect, useMemo, useState } from "react";
import { listProviderConnections, setChapterTextProvider, type CloseChapterBody, type ProviderConnection } from "../../api";
import { Button, Checkbox, Icon, SimpleSelect, TextArea } from "../base";

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
  const [addClosingMessage, setAddClosingMessage] = useState(false);
  const [closingMessage, setClosingMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
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

  function handleProviderChange(id: string) {
    setProviderId(id);
    setProviderError(null);
    // Persisted as soon as it is chosen, like the New Playthrough field: the preference must
    // survive a cancelled dialog, and no preference write is coupled to the close itself.
    setChapterTextProvider(id === "" ? null : id).catch((error: unknown) => {
      setProviderError(error instanceof Error ? error.message : "Could not save that connection");
    });
  }

  // Escape closes the dialog — the same contract ConfirmModal gives every other one.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isLoading) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading, onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isLoading) onCancel(); }}>
      <section className="modal close-chapter-modal" onMouseDown={(event) => event.stopPropagation()} aria-label="Close Chapter">
        <header className="modal-header">
          <div>
            <h2>Close Chapter</h2>
            <p>
              {visibleMessageCount} message{visibleMessageCount === 1 ? "" : "s"} in the running chapter become
              an archived volume: the model writes a name, a one-line description and a full summary, and
              opens the next chapter so the chat is never left empty. The transcript and the memories stay.
            </p>
          </div>
          <button className="flex items-center gap-1 modal-close-btn" onClick={onCancel} aria-label="Close">
            <Icon name="X" size={14} /> Close
          </button>
        </header>

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
          <Checkbox
            checked={addClosingMessage}
            onChange={(event) => setAddClosingMessage(event.target.checked)}
            label="Add custom closing note or author remark"
          />
          {addClosingMessage ? (
            <TextArea
              value={closingMessage}
              onChange={(event) => setClosingMessage(event.target.value)}
              placeholder="Write a closing remark or scene resolution…"
              rows={3}
            />
          ) : null}
        </div>

        {errorMessage ? <p className="error-box">{errorMessage}</p> : null}

        <div className="settings-actions">
          <Button
            variant="primary"
            size="md"
            disabled={isLoading}
            isLoading={isLoading}
            onClick={() =>
              onConfirm({
                addClosingMessage,
                ...(addClosingMessage && closingMessage ? { closingMessage } : {}),
                ...(providerId ? { providerId } : {})
              })
            }
          >
            {isLoading ? "Closing & Summarizing…" : "Confirm & Close"}
          </Button>
          <Button variant="secondary" size="md" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
