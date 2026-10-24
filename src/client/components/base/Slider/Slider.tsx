import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import { Icon } from "../Icon";
import { TooltipIcon } from "../Tooltip/Tooltip";

export interface SliderProps {
  label: string;
  rangeHint?: string;
  description?: string;
  /** Optional extra control (e.g. a "Model max" button) rendered on the right of the slider header. */
  headerExtra?: ReactNode;
  value: number | null | undefined;
  onChange: (value: number | null | undefined) => void;
  min: number;
  max: number;
  /** Optional upper bound for the range slider track when the numeric input allows larger numbers (e.g. Top K, Context Window). */
  sliderMax?: number;
  step?: number;
  /** Resting position of the slider thumb when `value` is unset (`null` or `undefined`), and the target value restored by Reset when `clearable` is false. */
  defaultPreview?: number;
  /** When true, emptying the number box or clicking Reset sets the value to `clearedValue` ("Default"). */
  clearable?: boolean;
  /** Value emitted when cleared (`null` by default so PATCH/PUT payloads clear stored values). */
  clearedValue?: null | undefined;
  integer?: boolean;
  dirty?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  label,
  rangeHint,
  description,
  headerExtra,
  value,
  onChange,
  min,
  max,
  sliderMax,
  step = 0.05,
  defaultPreview,
  clearable = false,
  clearedValue = null,
  integer = false,
  dirty = false,
  disabled = false,
  className = "",
}: SliderProps) {
  const id = useId();
  const isSet = value !== undefined && value !== null && Number.isFinite(value);
  const trackMax = sliderMax ?? max;
  const fallbackValue = defaultPreview ?? min;
  const sliderNumericValue = isSet
    ? Math.min(trackMax, Math.max(min, value))
    : Math.min(trackMax, Math.max(min, fallbackValue));

  const fillPercent =
    trackMax > min
      ? Math.min(100, Math.max(0, ((sliderNumericValue - min) / (trackMax - min)) * 100))
      : 0;

  // Keep a local string draft while the number input is focused so typing "0." or "-0." doesn't get clobbered mid-keystroke.
  const [draft, setDraft] = useState<string>(() => (isSet ? String(value) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(isSet ? String(value) : "");
    }
  }, [value, isSet, focused]);

  function normalizeNumber(rawNum: number): number {
    if (integer) {
      return Math.max(min, Math.round(rawNum));
    }
    // Round floating-point step artifacts (e.g. 0.30000000000000004 -> 0.3)
    return Number(rawNum.toFixed(4));
  }

  function handleRangeChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = Number(e.target.value);
    if (!Number.isFinite(raw)) return;
    const next = normalizeNumber(raw);
    setDraft(String(next));
    onChange(next);
  }

  function handleNumberChange(e: ChangeEvent<HTMLInputElement>) {
    const rawText = e.target.value;
    setDraft(rawText);
    const trimmed = rawText.trim();
    if (!trimmed) {
      onChange(clearable ? clearedValue : undefined);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      onChange(normalizeNumber(parsed));
    }
  }

  function handleReset() {
    if (clearable) {
      setDraft("");
      onChange(clearedValue);
    } else {
      setDraft(String(fallbackValue));
      onChange(fallbackValue);
    }
  }

  const canReset =
    !disabled &&
    (clearable
      ? isSet
      : defaultPreview !== undefined && isSet && value !== defaultPreview);

  const rootClasses = [
    "base-slider",
    isSet ? "base-slider--active" : "base-slider--unset",
    dirty ? "base-slider--dirty" : "",
    disabled ? "base-slider--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClasses}>
      <div className="base-slider__header">
        <label htmlFor={id} className="base-slider__label">
          <span>{label}</span>
          {rangeHint && <span className="base-slider__range">({rangeHint})</span>}
          {description && <TooltipIcon content={description} />}
          {dirty && (
            <Badge variant="warning" size="xs">
              Modified
            </Badge>
          )}
        </label>
        {(headerExtra || canReset) && (
          <div className="base-slider__actions">
            {headerExtra}
            {canReset && (
              <button
                type="button"
                className="base-slider__reset"
                onClick={handleReset}
                title={
                  clearable
                    ? "Reset to provider default (omit from request)"
                    : `Reset to default (${fallbackValue.toLocaleString()})`
                }
                aria-label={`Reset ${label} to default`}
              >
                <Icon name="RotateCcw" size={11} />
                <span>
                  {clearable ? "Default" : `Default (${fallbackValue.toLocaleString()})`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="base-slider__controls">
        <input
          type="range"
          className="base-slider__track"
          min={min}
          max={trackMax}
          step={step}
          value={sliderNumericValue}
          onChange={handleRangeChange}
          disabled={disabled}
          aria-label={`${label} slider`}
          style={{ "--slider-fill": `${fillPercent}%` } as React.CSSProperties}
        />
        <input
          id={id}
          type="number"
          className="base-form-input base-form-input--sm base-slider__number"
          min={min}
          max={max}
          step={step}
          placeholder={clearable ? "Default" : String(fallbackValue)}
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setDraft(isSet ? String(value) : "");
          }}
          onChange={handleNumberChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default Slider;
