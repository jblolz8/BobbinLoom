import { Button, Icon, Stack, StatusMessage, TextInput } from "../../base";

/**
 * The API-key field block: masked input, reveal/hide toggle, and the
 * stored-in-vault / marked-for-removal status rows.
 *
 * Lifted verbatim out of `ProviderConnections.tsx` so the text and image
 * editors share one implementation. The container still owns the state
 * (`showKey`, `keyBusy`, the payload's `apiKey`) because it is also the thing
 * that talks to `getProviderApiKey`, so this stays presentational.
 */
export type ApiKeyFieldProps = {
  /** Current field value. `null` means "clear the stored key on Save"; an
   *  empty string means "no key typed yet". */
  value: string | null | undefined;
  onChange: (value: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  /** A `getProviderApiKey` request is in flight (reveal is disabled). */
  keyBusy: boolean;
  /** The stored key is marked for removal on the next Save. */
  isKeyCleared: boolean;
  /** A key is stored in the vault and the field still holds it. */
  isStoredKeyActive: boolean;
  onClearKey: () => void;
  onRestoreKey: () => void;
};

export function ApiKeyField({
  value,
  onChange,
  showKey,
  onToggleShowKey,
  keyBusy,
  isKeyCleared,
  isStoredKeyActive,
  onClearKey,
  onRestoreKey,
}: ApiKeyFieldProps) {
  return (
    <Stack direction="column" align="stretch" gap="2xs">
      <TextInput
        label="API Key"
        tooltip="Your provider API key. Stored encrypted in your local vault; leave blank for local servers that do not require authentication."
        size="sm"
        type={showKey ? "text" : "password"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isKeyCleared ? "Cleared on Save" : "Enter API key"}
        leftIcon={<Icon name="KeyRound" size={13} />}
        rightElement={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onToggleShowKey}
            disabled={keyBusy}
            isLoading={keyBusy}
            leftIcon={showKey ? "EyeOff" : "Eye"}
          >
            {showKey ? "Hide" : "Show"}
          </Button>
        }
      />
      {isKeyCleared ? (
        <Stack direction="row" align="center" justify="between" gap="xs">
          <StatusMessage variant="inline" tone="warn" icon="AlertTriangle">
            Key marked for removal on Save
          </StatusMessage>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRestoreKey}
            leftIcon="RotateCcw"
          >
            Undo
          </Button>
        </Stack>
      ) : isStoredKeyActive ? (
        <Stack direction="row" align="center" justify="between" gap="xs">
          <StatusMessage variant="inline" tone="neutral" icon="LockKeyhole">
            Stored in encrypted vault
          </StatusMessage>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClearKey}
            leftIcon="Trash2"
          >
            Clear stored key
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
