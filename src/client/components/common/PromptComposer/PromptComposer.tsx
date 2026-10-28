import {
  forwardRef,
  type FocusEventHandler,
  type KeyboardEvent,
} from "react";
import { Button, Icon, Stack, TextArea } from "../../base";
import "./PromptComposer.css";

export interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  loading: boolean;
  canContinue: boolean;
  onCancel: () => void;
  choicesEnabled?: boolean;
  choices?: string[];
  onChoiceClick?: (choice: string) => void;
  showComposer?: boolean;
  placeholder?: string;
}

export const PromptComposer = forwardRef<
  HTMLTextAreaElement,
  PromptComposerProps
>(function PromptComposer(
  {
    value,
    onChange,
    onSend,
    onKeyDown,
    onFocus,
    loading,
    canContinue,
    onCancel,
    choicesEnabled = false,
    choices = [],
    onChoiceClick,
    showComposer = true,
    placeholder = 'Plain text is action. "Quoted text" is dialogue.',
  },
  ref,
) {
  const isContinue = !value.trim() && canContinue;

  return (
    <div className="prompt-composer">
      {choicesEnabled && choices.length > 0 && !loading ? (
        <div className="prompt-composer__choices choices">
          {choices.map((c) => (
            <Button
              key={c}
              size="sm"
              variant="secondary"
              className="prompt-composer__choice-btn choice-btn"
              onClick={() => onChoiceClick?.(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      ) : null}

      {showComposer ? (
        <div className="prompt-composer__card prompt-card-container">
          <TextArea
            ref={ref}
            borderless
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            placeholder={placeholder}
            rows={1}
            autoGrow
            autoGrowMax={110}
            disabled={loading}
            className="prompt-composer__textarea prompt-card-textarea"
          />
          <div className="prompt-composer__footer prompt-card-footer">
            <div className="prompt-composer__hints prompt-card-hints">
              <span className="prompt-composer__hint-item">
                <kbd className="prompt-composer__kbd">Enter ↵</kbd> send
              </span>
              <span className="prompt-composer__hint-dot">·</span>
              <span className="prompt-composer__hint-item">
                <kbd className="prompt-composer__kbd">Shift + Enter</kbd> new
                line
              </span>
            </div>
            <Stack
              direction="row"
              align="center"
              gap="sm"
              className="prompt-composer__actions prompt-card-actions"
            >
              {loading ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="cancel-btn"
                  onClick={onCancel}
                  leftIcon={<Icon name="Square" size={12} />}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  className="send-btn"
                  onClick={onSend}
                  disabled={!value.trim() && !canContinue}
                  leftIcon={
                    <Icon
                      name={isContinue ? "FastForward" : "Send"}
                      size={13}
                    />
                  }
                  title={
                    isContinue
                      ? "Ask the AI to respond to your last message"
                      : undefined
                  }
                >
                  {isContinue ? "Continue" : "Send"}
                </Button>
              )}
            </Stack>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default PromptComposer;
