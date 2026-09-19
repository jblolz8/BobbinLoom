import { useEffect, useMemo, useState } from "react";
import { listProviderConnections, type ProviderConnection } from "../../api";
import { Button, SimpleSelect } from "../base";
import { Dialog } from "../base/Dialog";

export type BrainstormSettingsModalProps = {
  /** Whether this card has an original CCv2 copy — the context setting needs one to mean anything. */
  hasOriginalCcv2: boolean;
  includeOriginalCard: boolean;
  allowNewSections: boolean;
  providerId: string | null;
  errorMessage?: string | null;
  onToggleIncludeOriginalCard: (include: boolean) => void;
  onToggleAllowNewSections: (allow: boolean) => void;
  onProviderChange: (id: string | null) => void;
  onClose: () => void;
};

/**
 * The brainstorm assistant's settings.
 *
 * Both choices are written as they change, so there is nothing to save and the dialog is closed with
 * one button. The original-card context is shown disabled rather than hidden when the card has no
 * CCv2 copy: a control that disappears reads as a bug, and the reason it is unavailable is worth a
 * sentence.
 */
export function BrainstormSettingsModal({
  hasOriginalCcv2,
  includeOriginalCard,
  allowNewSections,
  providerId,
  errorMessage,
  onToggleIncludeOriginalCard,
  onToggleAllowNewSections,
  onProviderChange,
  onClose
}: BrainstormSettingsModalProps) {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [activeTextProviderId, setActiveTextProviderId] = useState("");

  useEffect(() => {
    let cancelled = false;
    listProviderConnections()
      .then((registry) => {
        if (cancelled) return;
        setConnections(registry.connections.filter((connection) => connection.kind === "text"));
        setActiveTextProviderId(registry.activeTextProviderId ?? "");
      })
      .catch(() => {
        /* No registry to read: the select simply offers the active connection. */
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
    // A stored choice whose connection is gone stays selectable so it can be re-pointed.
    if (providerId && !connections.some((connection) => connection.id === providerId)) {
      rows.push({ value: providerId, label: `${providerId} (not found)` });
    }
    return [{ value: "", label: "Active connection" }, ...rows];
  }, [connections, activeTextProviderId, providerId]);

  return (
    <Dialog
      title="AI Brainstorm Assistant Settings"
      className="brainstorm-settings-modal"
      maxWidth={460}
      onClose={onClose}
      description="Both choices are remembered as you change them."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="form-field">
        <label className="brainstorm-settings-toggle">
          <input
            type="checkbox"
            checked={includeOriginalCard}
            disabled={!hasOriginalCcv2}
            onChange={(event) => onToggleIncludeOriginalCard(event.target.checked)}
          />
          <span>Include Original Card Context</span>
        </label>
        <span className="field-hint">
          {hasOriginalCcv2
            ? "Sends the imported CCv2 card alongside the current sheet, so the assistant can see what the character was."
            : "This card has no imported CCv2 original to send."}
        </span>
      </div>

      <div className="form-field">
        <label className="brainstorm-settings-toggle">
          <input
            type="checkbox"
            checked={allowNewSections}
            onChange={(event) => onToggleAllowNewSections(event.target.checked)}
          />
          <span>Allow sections outside the current structure</span>
        </label>
        <span className="field-hint">
          The assistant may propose a section the format does not list — [Daily Life], [Cat Traits] —
          and it is added at the end of the sheet. A name that nearly matches one of the format's own
          sections is applied to that section instead.
        </span>
      </div>

      <div className="form-field">
        <span className="field-label-text">Text Provider</span>
        <SimpleSelect
          id="brainstorm-provider"
          size="sm"
          variant="filled"
          fullWidth
          value={providerId ?? ""}
          onChange={(value) => onProviderChange(value === "" ? null : value)}
          options={options}
          placeholder="Active connection"
          aria-label="Text provider"
        />
        <span className="field-hint">Writes the brainstorm replies. Remembered for the next one.</span>
        {errorMessage ? <span className="field-hint error">{errorMessage}</span> : null}
      </div>
    </Dialog>
  );
}
