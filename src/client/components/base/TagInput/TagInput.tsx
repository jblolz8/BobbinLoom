import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { TagChip } from "../TagChip/TagChip";
import { sortTags, type TagTaxonomyConfig } from "../../../../engine/tagTaxonomy";
import "./TagInput.css";

export type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  taxonomy?: "character" | "playthrough";
  userConfig?: TagTaxonomyConfig | null;
  /** Optional list of library tags for typeahead autocomplete suggestions. */
  suggestions?: string[];
  /** Normalize added tags to lowercase and sort via taxonomy when true. */
  sortOnChange?: boolean;
  /** Size of rendered TagChip items. Defaults to "sm". */
  chipSize?: "xs" | "sm" | "md";
  /** Optional field label rendered above the tag input box. */
  label?: ReactNode;
  /** Optional action element rendered on the right side of the label header row. */
  headerAction?: ReactNode;
};

export function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
  taxonomy = "character",
  userConfig,
  suggestions,
  sortOnChange = false,
  chipSize = "sm",
  label,
  headerAction,
}: TagInputProps) {
  const [text, setText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedSuggestionIdx, setFocusedSuggestionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasSuggestions = Boolean(suggestions && suggestions.length > 0);

  const availableSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    const q = text.trim().toLowerCase();
    if (!q) {
      return suggestions.filter((t) => !value.includes(t)).slice(0, 8);
    }
    return suggestions
      .filter((t) => t.toLowerCase().includes(q) && !value.includes(t))
      .slice(0, 10);
  }, [suggestions, value, text]);

  useEffect(() => {
    setFocusedSuggestionIdx(-1);
  }, [availableSuggestions]);

  function applyNext(next: string[]) {
    onChange(sortOnChange ? sortTags(next, userConfig) : next);
  }

  function commit(items: string[]) {
    const cleaned = items
      .map((s) => (sortOnChange ? s.trim().toLowerCase() : s.trim()))
      .filter(Boolean);
    if (cleaned.length === 0) return;
    const novel = cleaned.filter((s) => !value.includes(s));
    if (novel.length > 0) {
      applyNext([...value, ...novel]);
    }
    setText("");
    setShowSuggestions(false);
    setFocusedSuggestionIdx(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (hasSuggestions && showSuggestions && availableSuggestions.length > 0) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setFocusedSuggestionIdx((prev) =>
            prev <= 0 ? availableSuggestions.length - 1 : prev - 1,
          );
        } else {
          setFocusedSuggestionIdx((prev) =>
            prev >= availableSuggestions.length - 1 ? 0 : prev + 1,
          );
        }
        return;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedSuggestionIdx((prev) =>
          prev >= availableSuggestions.length - 1 ? 0 : prev + 1,
        );
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedSuggestionIdx((prev) =>
          prev <= 0 ? availableSuggestions.length - 1 : prev - 1,
        );
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        setFocusedSuggestionIdx(-1);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (
        hasSuggestions &&
        showSuggestions &&
        focusedSuggestionIdx >= 0 &&
        focusedSuggestionIdx < availableSuggestions.length
      ) {
        commit([availableSuggestions[focusedSuggestionIdx]!]);
      } else {
        commit(text.split(","));
      }
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      applyNext(value.slice(0, -1));
    } else if (e.key === ",") {
      e.preventDefault();
      commit([text]);
    }
  }

  function handleBlur() {
    if (hasSuggestions) {
      setTimeout(() => {
        setShowSuggestions(false);
        setFocusedSuggestionIdx(-1);
      }, 200);
      return;
    }
    if (text.trim()) {
      commit(text.split(","));
    }
  }

  function removeTag(index: number) {
    applyNext(value.filter((_, i) => i !== index));
  }

  function focusInput() {
    inputRef.current?.focus();
  }

  const box = (
    <div
      className={`tag-input ${disabled ? "disabled" : ""}`}
      onClick={focusInput}
    >
      {value.map((tag, i) => (
        <TagChip
          key={`${tag}-${i}`}
          tag={tag}
          size={chipSize}
          taxonomy={taxonomy}
          userConfig={userConfig}
          disabled={disabled}
          onRemove={!disabled ? () => removeTag(i) : undefined}
        />
      ))}
      {!disabled ? (
        <div className="tag-input-anchor">
          <input
            ref={inputRef}
            type="text"
            value={text}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : "Add tag…"}
            onChange={(e) => {
              const val = e.target.value;
              if (val.includes(",")) {
                commit(val.split(","));
              } else {
                setText(val);
                if (hasSuggestions) setShowSuggestions(true);
              }
            }}
            onFocus={() => {
              if (hasSuggestions) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          {hasSuggestions &&
          showSuggestions &&
          availableSuggestions.length > 0 ? (
            <div className="tag-input-dropdown" role="listbox">
              <span className="tag-input-dropdown__header">
                Library Suggestions:
              </span>
              {availableSuggestions.map((sug, idx) => (
                <button
                  key={sug}
                  type="button"
                  role="option"
                  aria-selected={idx === focusedSuggestionIdx}
                  className={`tag-input-dropdown__item ${idx === focusedSuggestionIdx ? "is-focused" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit([sug]);
                  }}
                  onMouseEnter={() => setFocusedSuggestionIdx(idx)}
                >
                  <TagChip
                    tag={sug}
                    taxonomy={taxonomy}
                    userConfig={userConfig}
                    size="xs"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!label && !headerAction) {
    return box;
  }

  return (
    <div className="tag-input-field">
      <div className="tag-input-header">
        {label ? <span className="tag-input-label">{label}</span> : <span />}
        {headerAction}
      </div>
      {box}
    </div>
  );
}
