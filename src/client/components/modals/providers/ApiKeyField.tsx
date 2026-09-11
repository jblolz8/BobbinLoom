import { Button, Icon, TextInput } from "../../base";

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
  onRestoreKey
}: ApiKeyFieldProps) {
  return (
    <div>
      <TextInput
        label="API Key"
        type={showKey ? "text" : "password"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isKeyCleared ? "Key will be cleared on Save" : "Enter API key"}
        leftIcon={<Icon name="KeyRound" size={14} />}
        rightElement={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onToggleShowKey}
            disabled={keyBusy}
            isLoading={keyBusy}
            leftIcon={<Icon name={showKey ? "EyeOff" : "Eye"} size={14} />}
          >
            {showKey ? "Hide" : "Show"}
          </Button>
        }
      />
      {isKeyCleared ? (
        <div className="conn-key-status-row">
          <span className="conn-key-warning-status">
            <Icon name="AlertTriangle" size={13} />
            <span>Key marked for removal on Save</span>
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={onRestoreKey} leftIcon={<Icon name="RotateCcw" size={12} />}>
            Undo
          </Button>
        </div>
      ) : isStoredKeyActive ? (
        <div className="conn-key-status-row">
          <span className="conn-key-vault-status">
            <Icon name="LockKeyhole" size={13} />
            <span>Stored in encrypted vault</span>
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={onClearKey} leftIcon={<Icon name="Trash2" size={12} />}>
            Clear stored key
          </Button>
        </div>
      ) : null}
    </div>
  );
}
