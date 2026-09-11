/**
 * The Style Preset select's display decision, lifted out of
 * `ImageConnectionEditor` so it can be reasoned about — and unit-tested —
 * without React or a network.
 *
 * The valid values belong to the PROVIDER, not to the user: Venice lists its
 * own, title-cased and case-sensitive. The catch is that the list has to be
 * FETCHED, so the form routinely holds a saved value before (or without) the
 * list arriving. The reported bug lived in exactly that gap: while `styles` was
 * still empty, a saved `Anime` fell through to the Custom… escape hatch and the
 * user's correctly saved value looked unsaved.
 *
 * Two invariants this module keeps:
 *
 *  1. `selectValue` is ALWAYS one of the returned `options`. A select whose
 *     value matches no option falls back to its placeholder, which is another
 *     way a stored value can look lost.
 *  2. A non-empty stored value is never presented as the escape hatch until a
 *     LOADED list proves it absent. An empty list means "not fetched (yet)",
 *     NOT "nothing is valid" — the distinction is the whole point.
 */

/** The Style Preset select's escape hatch. Not a valid style value (no provider
 *  returns `__custom__`), so it can never collide with a real one: a
 *  self-hosted or future endpoint that does not implement the styles listing
 *  stays usable through it. */
export const CUSTOM_STYLE_OPTION = "__custom__";

/** The None option's value. An empty stylePreset is OMITTED from the request
 *  body by the Venice adapter, so None really does send nothing. */
export const NONE_STYLE_OPTION = "";

export type ImageStyleOption = {
  value: string;
  label: string;
  description?: string;
};

export type ImageStyleDisplayInput = {
  /** The stored/draft stylePreset. `""` is None. */
  value: string;
  /** The provider's fetched list. Empty means "not fetched (yet)". */
  styles: string[];
  /** True once the user explicitly picks Custom… from the select. */
  customRequested: boolean;
};

export type ImageStyleDisplay = {
  /** The value to drive the select with — always one of `options`. */
  selectValue: string;
  options: ImageStyleOption[];
  /** Show the free-text input holding the raw value. */
  showCustomInput: boolean;
  /** Show the "not one of the styles this provider lists" warning. */
  showWarning: boolean;
  /** The case-insensitive "did you mean X?" suggestion for the warning. */
  suggestion: string | undefined;
};

export function imageStyleDisplay({
  value,
  styles,
  customRequested
}: ImageStyleDisplayInput): ImageStyleDisplay {
  const valueInList = value !== "" && styles.includes(value);
  const listLoaded = styles.length > 0;
  // Only a LOADED list can prove a stored value wrong. The membership test is
  // case-SENSITIVE (Venice is), so `anime` against `Anime` is genuinely a value
  // the provider rejects — that is what the warning and the suggestion below
  // are for.
  const valueNotListed = listLoaded && value !== "" && !valueInList;
  const showCustom = customRequested || valueNotListed;

  const options: ImageStyleOption[] = [
    { value: NONE_STYLE_OPTION, label: "None", description: "Send no style_preset" }
  ];
  const seen = new Set<string>([NONE_STYLE_OPTION]);
  for (const style of styles) {
    if (seen.has(style)) continue;
    seen.add(style);
    options.push({ value: style, label: style });
  }
  // While the list is unknown a non-empty stored value keeps an option of its
  // own, so the select renders it as ITSELF. Once a loaded list proves it
  // absent the escape hatch takes over instead and the raw value moves into the
  // custom input (the "fix this value" state, with the warning).
  if (value !== "" && !valueInList && !valueNotListed && !seen.has(value)) {
    seen.add(value);
    options.push({ value, label: value });
  }
  options.push({ value: CUSTOM_STYLE_OPTION, label: "Custom…", description: "Type an exact value" });

  const suggestion = valueNotListed
    ? styles.find((style) => style.toLowerCase() === value.trim().toLowerCase())
    : undefined;

  return {
    selectValue: showCustom ? CUSTOM_STYLE_OPTION : value,
    options,
    showCustomInput: showCustom,
    showWarning: valueNotListed,
    suggestion
  };
}
