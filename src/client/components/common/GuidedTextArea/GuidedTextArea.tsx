import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { CharacterFormat } from "../../../../schemas";
import {
  applyAutocompleteSuggestion,
  applyLineQuickFix,
  getAutocompleteContext,
  getSectionSuggestions,
  insertBulletKey,
  lintGuidedSectionText,
  parseClothingFromText,
  type GuidedSectionKind,
  type GuidedSuggestionItem,
} from "../../../../engine/guidedSectionHelpers";
import { Badge, Button, Icon, TextArea, type TextAreaProps } from "../../base";
import "./GuidedTextArea.css";

export interface GuidedTextAreaProps extends Omit<
  TextAreaProps,
  "value" | "onChange"
> {
  /** Which character/persona section this field represents (`body`, `appearance`, or `clothing`). */
  sectionKind: GuidedSectionKind;
  /** Controlled text value. */
  value: string;
  /** Value change handler. */
  onChange: (nextValue: string) => void;
  /** Optional active CharacterFormat from prompt settings so suggestions match the user's sheet schema. */
  characterFormat?: CharacterFormat;
  /** Optional extra description or helper note below the field. */
  sectionHint?: ReactNode;
}

export function GuidedTextArea({
  sectionKind,
  value,
  onChange,
  characterFormat,
  label,
  tooltip,
  placeholder,
  disabled,
  rows = 4,
  autoGrow = true,
  autoGrowMax = 260,
  helperText,
  ...restProps
}: GuidedTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caretOffset, setCaretOffset] = useState<number>(0);
  const [isFocused, setIsFocused] = useState(false);
  const [forceAutocomplete, setForceAutocomplete] = useState(false);
  const [dismissedAtCaret, setDismissedAtCaret] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(
    () => getSectionSuggestions(sectionKind, value, characterFormat),
    [sectionKind, value, characterFormat],
  );

  const unusedSuggestions = useMemo(
    () => suggestions.filter((s) => !s.used),
    [suggestions],
  );

  const diagnostics = useMemo(
    () => lintGuidedSectionText(value, sectionKind),
    [value, sectionKind],
  );

  const parsedClothingCount = useMemo(
    () =>
      sectionKind === "clothing" ? parseClothingFromText(value).length : 0,
    [sectionKind, value],
  );

  const autocomplete = useMemo(() => {
    if (!isFocused || disabled) {
      return {
        active: false,
        query: "",
        lineNumber: 1,
        lineStart: 0,
        lineEnd: 0,
        matches: [] as GuidedSuggestionItem[],
      };
    }
    if (
      dismissedAtCaret !== null &&
      dismissedAtCaret === caretOffset &&
      !forceAutocomplete
    ) {
      return {
        active: false,
        query: "",
        lineNumber: 1,
        lineStart: 0,
        lineEnd: 0,
        matches: [] as GuidedSuggestionItem[],
      };
    }
    return getAutocompleteContext(
      value,
      caretOffset,
      suggestions,
      forceAutocomplete,
    );
  }, [
    isFocused,
    disabled,
    dismissedAtCaret,
    caretOffset,
    forceAutocomplete,
    value,
    suggestions,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [autocomplete.query, autocomplete.lineNumber, autocomplete.active]);

  function focusAndSetCaret(nextCaret: number, openMenu = false) {
    setCaretOffset(nextCaret);
    setDismissedAtCaret(null);
    setForceAutocomplete(openMenu);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleSelectSuggestion(item: GuidedSuggestionItem) {
    const result = applyAutocompleteSuggestion(value, caretOffset, item.key);
    onChange(result.text);
    setForceAutocomplete(false);
    focusAndSetCaret(result.caretOffset, false);
  }

  function handleQuickChipClick(key: string) {
    if (disabled) return;
    const result = insertBulletKey(value, key);
    onChange(result.text);
    focusAndSetCaret(result.caretOffset, false);
  }

  function handleQuickFix(lineNo: number, replacementLine: string) {
    if (disabled) return;
    const nextText = applyLineQuickFix(value, lineNo, replacementLine);
    onChange(nextText);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value;
    const nextCaret = e.target.selectionStart ?? nextVal.length;
    setDismissedAtCaret(null);
    setForceAutocomplete(false);
    setCaretOffset(nextCaret);
    onChange(nextVal);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart ?? value.length;
      setCaretOffset(pos);
      setDismissedAtCaret(null);
      setForceAutocomplete(true);
      return;
    }

    if (autocomplete.active && autocomplete.matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % autocomplete.matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (prev) =>
            (prev - 1 + autocomplete.matches.length) %
            autocomplete.matches.length,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const chosen =
          autocomplete.matches[activeIndex] ?? autocomplete.matches[0];
        if (chosen) {
          handleSelectSuggestion(chosen);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setForceAutocomplete(false);
        setDismissedAtCaret(caretOffset);
        return;
      }
    }

    // Smart Enter behavior on bullet lines (`- Key: Value`)
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const el = e.currentTarget;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      if (start === end) {
        const lineStart =
          start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
        const nextNl = value.indexOf("\n", start);
        const lineEnd = nextNl === -1 ? value.length : nextNl;
        const currentLine = value.slice(lineStart, lineEnd);

        // Pressing Enter on an empty `- ` bullet exits bullet mode cleanly
        if (/^\s*-\s*$/.test(currentLine)) {
          e.preventDefault();
          const nextText = value.slice(0, lineStart) + value.slice(lineEnd);
          onChange(nextText);
          focusAndSetCaret(lineStart, false);
          return;
        }

        // Pressing Enter at the end of a non-empty bullet line continues with `\n- `
        if (start === lineEnd && /^\s*-\s+.+/.test(currentLine)) {
          e.preventDefault();
          const insert = "\n- ";
          const nextText =
            value.slice(0, start) + insert + value.slice(lineEnd);
          const nextPos = start + insert.length;
          onChange(nextText);
          focusAndSetCaret(nextPos, true);
          return;
        }
      }
    }
  }

  const labelNode = label ? (
    <span className="guided-textarea-header-meta">
      <span>{label}</span>
      {sectionKind === "clothing" ? (
        <Badge
          variant={parsedClothingCount > 0 ? "accent" : "neutral"}
          size="xs"
        >
          {parsedClothingCount} {parsedClothingCount === 1 ? "slot" : "slots"}
        </Badge>
      ) : null}
    </span>
  ) : undefined;

  return (
    <div className="guided-textarea-root">
      <div className="guided-textarea-field-wrap">
        <TextArea
          ref={textareaRef}
          label={labelNode}
          tooltip={tooltip}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) =>
            setCaretOffset(e.currentTarget.selectionStart ?? value.length)
          }
          onKeyUp={(e) => {
            if (
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "Home" ||
              e.key === "End"
            ) {
              setCaretOffset(e.currentTarget.selectionStart ?? value.length);
            }
          }}
          onFocus={(e) => {
            setIsFocused(true);
            setCaretOffset(e.currentTarget.selectionStart ?? value.length);
          }}
          onBlur={() => {
            setIsFocused(false);
            setForceAutocomplete(false);
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          autoGrow={autoGrow}
          autoGrowMax={autoGrowMax}
          helperText={helperText}
          {...restProps}
        />

        {autocomplete.active && autocomplete.matches.length > 0 ? (
          <div
            className="guided-autocomplete-popover"
            role="listbox"
            aria-label={`${sectionKind} attribute suggestions`}
          >
            <div className="guided-autocomplete-header">
              <span>
                {sectionKind === "clothing"
                  ? "Clothing Slots"
                  : sectionKind === "body"
                    ? "Body Attributes"
                    : "Appearance Attributes"}
              </span>
              <span>Tab / Enter to insert · Esc to close</span>
            </div>
            <div className="guided-autocomplete-list">
              {autocomplete.matches.slice(0, 8).map((item, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`guided-autocomplete-item ${isActive ? "is-active" : ""} ${item.used ? "is-used" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(item);
                    }}
                  >
                    <span className="guided-autocomplete-key">
                      - {item.key}:
                    </span>
                    {item.example ? (
                      <span className="guided-autocomplete-example">
                        {item.example}
                      </span>
                    ) : null}
                    {item.used ? (
                      <Badge variant="neutral" size="xs">
                        Used
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick-insert pills for unused canonical keys/slots */}
      {unusedSuggestions.length > 0 && !disabled ? (
        <div className="guided-quick-chips">
          <span className="guided-quick-chips-label">
            {sectionKind === "clothing" ? "Add slot:" : "Add bullet:"}
          </span>
          {unusedSuggestions.slice(0, 8).map((item) => (
            <button
              key={item.key}
              type="button"
              className="guided-quick-chip"
              title={
                item.example
                  ? `Insert "- ${item.key}: " (e.g. ${item.example})`
                  : `Insert "- ${item.key}: "`
              }
              onClick={() => handleQuickChipClick(item.key)}
            >
              <Icon name="Plus" size={11} />
              <span>{item.key}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Non-blocking linter diagnostics */}
      {diagnostics.length > 0 ? (
        <div className="guided-linter-list" role="status" aria-live="polite">
          {diagnostics.map((diag, i) => (
            <div
              key={`${diag.line}-${i}`}
              className={`guided-linter-item guided-linter-item--${diag.severity}`}
            >
              <div className="guided-linter-item-main">
                <Icon
                  name={diag.severity === "warning" ? "AlertTriangle" : "Info"}
                  size={14}
                />
                <span>{diag.message}</span>
              </div>
              {diag.quickFixLine && !disabled ? (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => handleQuickFix(diag.line, diag.quickFixLine!)}
                >
                  Fix
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default GuidedTextArea;
