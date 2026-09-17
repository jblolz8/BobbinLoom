import type { ProviderConnectionPayload } from "../api";

/**
 * Whether a provider editor's form differs from the baseline it was seeded
 * with — the single source of truth for "would closing this discard work?".
 *
 * Deliberately FLAT and normalising rather than a structural/JSON comparison.
 * Two properties of this form make a naive diff report a clean form as dirty:
 *
 *  - `ProviderConnections.toPayload` stores emptied image strings as
 *    `undefined`, and the optional-number fields store `undefined` for an empty
 *    field, while a cleared `seed` is stored as `null` — so the same "no value"
 *    arrives as `undefined`, `null` or `""` depending on the field.
 *  - `formFromConnection` seeds string fields with `?? ""`, so a stored absent
 *    value and a typed-then-cleared one are indistinguishable by raw equality.
 *
 * Those three all mean "no value here" and compare equal. A real `0` does NOT
 * (it is a meaningful maxTokens / seed), which is why the normalisation is
 * explicit rather than a blanket falsy check.
 *
 * The API key is compared like any other field — a user who edits it has a
 * dirty form. Callers must not compute dirtiness until the stored key has
 * finished loading: `ProviderConnections.openEdit` fills it asynchronously, so
 * a baseline captured first would read as dirty the moment the key lands.
 */
function normalize(value: unknown): unknown {
  return value === undefined || value === null || value === "" ? null : value;
}

export function isConnectionDirty(
  form: ProviderConnectionPayload,
  baseline: ProviderConnectionPayload
): boolean {
  const left = form as Record<string, unknown>;
  const right = baseline as Record<string, unknown>;
  // Union of keys: a field present on only one side (a baseline seeded before a
  // field existed, or one the form has just added) is a difference, not a skip.
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (normalize(left[key]) !== normalize(right[key])) return true;
  }
  return false;
}

/**
 * The form's clean state after a successful save: the stored row mapped into form
 * space, with the one field the row CANNOT carry — the API key — taken from the
 * form that was just saved.
 *
 * This is what stops a save from leaving the form permanently dirty. `form` is
 * compared against a baseline captured when the editor opened, so unless the
 * baseline moves with the save, every later close (Cancel, the X, and Settings'
 * own Close) keeps offering to discard work that is already stored.
 *
 * `storedHasApiKey` is the row's own answer, and it is what makes a CLEAR settle:
 * `current.apiKey === null` means "clear the stored key on the next Save", so once
 * that save has happened the intent is spent and this state holds no key at all —
 * which is also what stops the field advertising a removal that already happened.
 * A row that still has a key (including one whose clear the server ignored) keeps
 * whatever the form holds, because the form is then the only copy of the secret.
 */
export function cleanStateAfterSave(
  storedForm: ProviderConnectionPayload,
  current: ProviderConnectionPayload,
  storedHasApiKey: boolean
): ProviderConnectionPayload {
  return { ...storedForm, apiKey: storedHasApiKey ? current.apiKey : "" };
}
