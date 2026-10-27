import { useEffect, useMemo, useState } from "react";
import {
  listProviderConnections,
  type ProviderConnection,
} from "../../../../api";
import {
  Button,
  CheckboxRow,
  Header,
  Icon,
  Modal,
  SimpleSelect,
  Stack,
  StatusMessage,
} from "../../../base";

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
  onClose,
}: BrainstormSettingsModalProps) {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [activeTextProviderId, setActiveTextProviderId] = useState("");

  useEffect(() => {
    let cancelled = false;
    listProviderConnections()
      .then((registry) => {
        if (cancelled) return;
        setConnections(
          registry.connections.filter(
            (connection) => connection.kind === "text",
          ),
        );
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
    const activeConnection = connections.find(
      (connection) => connection.id === activeTextProviderId,
    );
    const rows = connections.map((connection) => ({
      value: connection.id,
      label: `${connection.label}${connection.model ? ` — ${connection.model}` : ""}${
        connection.id === activeTextProviderId ? " (active)" : ""
      }`,
    }));
    // A stored choice whose connection is gone stays selectable so it can be re-pointed.
    if (
      providerId &&
      !connections.some((connection) => connection.id === providerId)
    ) {
      rows.push({ value: providerId, label: `${providerId} (not found)` });
    }
    const defaultLabel = activeConnection
      ? `Active connection (${activeConnection.label})`
      : "Active connection";
    return [{ value: "", label: defaultLabel }, ...rows];
  }, [connections, activeTextProviderId, providerId]);

  return (
    <Modal
      size="md"
      onClose={onClose}
      ariaLabel="AI Brainstorm Assistant Settings"
    >
      <Header
        variant="modal"
        icon={<Icon name="Settings" size={18} />}
        title="AI Brainstorm Assistant Settings"
        subtitle="Both choices are remembered as you change them."
        actions={
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            onClick={onClose}
            title="Close settings"
            aria-label="Close settings"
          >
            <Icon name="X" size={16} />
          </Button>
        }
      />

      <Modal.Content>
        <Stack direction="column" gap="sm" fullWidth>
          {errorMessage ? (
            <StatusMessage variant="banner" tone="err" icon="AlertCircle">
              {errorMessage}
            </StatusMessage>
          ) : null}

          <CheckboxRow
            icon="FileText"
            title="Include Original Card Context"
            checked={includeOriginalCard}
            disabled={!hasOriginalCcv2}
            onChange={(event) =>
              onToggleIncludeOriginalCard(event.target.checked)
            }
            description={
              hasOriginalCcv2
                ? "Sends the imported CCv2 card alongside the current sheet, so the assistant can see what the character was."
                : "This card has no imported CCv2 original to send."
            }
          />

          <CheckboxRow
            icon="ListPlus"
            title="Allow sections outside the current structure"
            checked={allowNewSections}
            onChange={(event) => onToggleAllowNewSections(event.target.checked)}
            description="The assistant may propose a section the format does not list — [Daily Life], [Cat Traits] — and it is added at the end of the sheet. A name that nearly matches one of the format's own sections is applied to that section instead."
          />

          <SimpleSelect
            id="brainstorm-provider"
            label="Text Provider"
            labelIcon="Sliders"
            size="sm"
            variant="filled"
            fullWidth
            value={providerId ?? ""}
            onChange={(value) => onProviderChange(value === "" ? null : value)}
            options={options}
            placeholder="Active connection"
            aria-label="Text provider"
            helperText="Writes the brainstorm replies. Remembered for the next one."
          />
        </Stack>
      </Modal.Content>

      <Modal.Footer>
        <Stack direction="row" justify="end" fullWidth>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
