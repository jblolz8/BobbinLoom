import { useState, useRef, type KeyboardEvent } from "react";
import { TagChip } from "./TagChip";

export type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function TagInput({ value, onChange, placeholder, disabled }: TagInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(items: string[]) {
    const cleaned = items
      .map((s) => s.trim())
      .filter(Boolean);
    if (cleaned.length === 0) return;
    const novel = cleaned.filter((s) => !value.includes(s));
    if (novel.length > 0) {
      onChange([...value, ...novel]);
    }
    setText("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(text.split(","));
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === ",") {
      e.preventDefault();
      commit([text]);
    }
  }

  function handleBlur() {
    if (text.trim()) {
      commit(text.split(","));
    }
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function focusInput() {
    inputRef.current?.focus();
  }

  return (
    <div
      className={`tag-input ${disabled ? "disabled" : ""}`}
      onClick={focusInput}
    >
      {value.map((tag, i) => (
        <TagChip
          key={`${tag}-${i}`}
          tag={tag}
          size="sm"
          disabled={disabled}
          onRemove={!disabled ? () => removeTag(i) : undefined}
        />
      ))}
      <input
        ref={inputRef}
        type="text"
        value={text}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
