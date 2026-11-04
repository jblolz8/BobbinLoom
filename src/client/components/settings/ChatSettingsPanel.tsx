import type { AutoScrollBehavior, MessageFontSize } from "../../../schemas";
import { MESSAGE_FONT_SIZE_VALUES } from "../../api";
import {
  Badge,
  Card,
  FormGrid,
  Header,
  Icon,
  Stack,
  SwitchRow,
  Text,
  type IconName,
} from "../base";

const MESSAGE_FONT_SIZE_OPTIONS: Array<{
  id: MessageFontSize;
  title: string;
  desc: string;
}> = [
  {
    id: "sm",
    title: "Small",
    desc: "Compact prose density for fitting more dialogue on screen",
  },
  {
    id: "standard",
    title: "Standard",
    desc: "Matches standard UI and inline editor text size (Default)",
  },
  {
    id: "md",
    title: "Medium",
    desc: "Slightly larger prose for relaxed reading",
  },
  {
    id: "lg",
    title: "Large",
    desc: "Spacious story text for high readability",
  },
  {
    id: "xl",
    title: "Extra Large",
    desc: "Maximum text size for effortless long-form reading",
  },
];

const AUTOSCROLL_OPTIONS: Array<{
  id: AutoScrollBehavior;
  title: string;
  desc: string;
  icon: IconName;
}> = [
  {
    id: "start",
    title: "Top of Message",
    desc: "Auto-scroll to the beginning of the new AI reply so you can read from paragraph 1 (Default)",
    icon: "ArrowUpToLine",
  },
  {
    id: "bottom",
    title: "Bottom of Message",
    desc: "Auto-scroll all the way to the end of the newly generated turn",
    icon: "ArrowDownToLine",
  },
  {
    id: "none",
    title: "Off",
    desc: "Leave the scroll position completely untouched when the response arrives",
    icon: "Ban",
  },
];

export interface ChatSettingsPanelProps {
  choicesEnabled: boolean;
  setChoicesEnabled: (enabled: boolean) => void;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  showContextUsage: boolean;
  setShowContextUsage: (show: boolean) => void;
  showGenerationTime?: boolean;
  setShowGenerationTime?: (show: boolean) => void;
  showMessageTimestamps?: boolean;
  setShowMessageTimestamps?: (show: boolean) => void;
  showModelName?: boolean;
  setShowModelName?: (show: boolean) => void;
  showMessageNumbers?: boolean;
  setShowMessageNumbers?: (show: boolean) => void;
  imagePromptPreview?: boolean;
  setImagePromptPreview?: (show: boolean) => void;
  autoImageAfterTurn?: boolean;
  setAutoImageAfterTurn?: (auto: boolean) => void;
  alwaysDiscardOldImage?: boolean;
  setAlwaysDiscardOldImage?: (always: boolean) => void;
  autoScrollBehavior?: AutoScrollBehavior;
  setAutoScrollBehavior?: (behavior: AutoScrollBehavior) => void;
  messageFontSize?: MessageFontSize;
  setMessageFontSize?: (size: MessageFontSize) => void;
}

export function ChatSettingsPanel({
  choicesEnabled,
  setChoicesEnabled,
  showDebug,
  setShowDebug,
  showContextUsage,
  setShowContextUsage,
  showGenerationTime = true,
  setShowGenerationTime,
  showMessageTimestamps = true,
  setShowMessageTimestamps,
  showModelName = true,
  setShowModelName,
  showMessageNumbers = true,
  setShowMessageNumbers,
  imagePromptPreview = true,
  setImagePromptPreview,
  autoImageAfterTurn = false,
  setAutoImageAfterTurn,
  alwaysDiscardOldImage = false,
  setAlwaysDiscardOldImage,
  autoScrollBehavior = "start",
  setAutoScrollBehavior,
  messageFontSize = "standard",
  setMessageFontSize,
}: ChatSettingsPanelProps) {
  return (
    <Stack direction="column" align="stretch" gap="md">
      <Stack direction="column" align="stretch" gap="2xs">
        <Header
          variant="section"
          icon="MessageSquare"
          title="Chat Message"
          subtitle="Choose which badges, metadata, and interactive controls appear on chat turns."
        />
        <SwitchRow
          icon="MessageSquare"
          title="Show Choices"
          description="Display suggested action choice buttons below turn responses"
          checked={choicesEnabled}
          onChange={(e) => setChoicesEnabled(e.target.checked)}
        />
        <SwitchRow
          icon="Clock"
          title="Display Response Generation Time"
          description="Show generation duration badge on AI responses"
          checked={showGenerationTime}
          onChange={(e) => setShowGenerationTime?.(e.target.checked)}
        />
        <SwitchRow
          icon="Calendar"
          title="Display Chat Message Timestamps"
          description="Show timestamps on chat messages"
          checked={showMessageTimestamps}
          onChange={(e) => setShowMessageTimestamps?.(e.target.checked)}
        />
        <SwitchRow
          icon="Bot"
          title="Display AI Model Name"
          description="Show model name and provider icon badge on AI responses"
          checked={showModelName}
          onChange={(e) => setShowModelName?.(e.target.checked)}
        />
        <SwitchRow
          icon="Hash"
          title="Display Message Numbers"
          description="Show #0, #1, #2... numbering on player and AI messages"
          checked={showMessageNumbers}
          onChange={(e) => setShowMessageNumbers?.(e.target.checked)}
        />
        <SwitchRow
          icon="BarChart2"
          title="Show Context Usage"
          description="Display the Context Meter token and memory usage indicator"
          checked={showContextUsage}
          onChange={(e) => setShowContextUsage(e.target.checked)}
        />
      </Stack>

      <Stack direction="column" align="stretch" gap="2xs">
        <Header
          variant="section"
          icon="Type"
          title="Message Font Size"
          subtitle="Adjust the text size for User and AI messages, inline Edit Mode, and the chat composer."
        />
        <FormGrid cols="compact" gap="xs">
          {MESSAGE_FONT_SIZE_OPTIONS.map((opt) => {
            const isSelected = messageFontSize === opt.id;
            const cssSize = MESSAGE_FONT_SIZE_VALUES[opt.id];
            return (
              <Card
                key={opt.id}
                as="button"
                type="button"
                variant="elevated"
                padding="xs"
                active={isSelected}
                hoverable
                onClick={() => setMessageFontSize?.(opt.id)}
                aria-pressed={isSelected}
              >
                <Stack direction="column" align="stretch" gap="2xs">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                  >
                    <Stack direction="row" align="center" gap="xs">
                      <Text as="span" tone="accent">
                        <Icon name="Type" size={14} />
                      </Text>
                      <Text
                        as="strong"
                        size="xs"
                        weight="semibold"
                        tone="primary"
                      >
                        {opt.title}
                      </Text>
                    </Stack>
                    <Stack direction="row" align="center" gap="2xs">
                      <Badge variant="neutral" size="xs">
                        {cssSize}
                      </Badge>
                      {isSelected && (
                        <Badge variant="accent" size="xs">
                          Active
                        </Badge>
                      )}
                    </Stack>
                  </Stack>
                  <Text as="p" variant="caption" tone="secondary">
                    {opt.desc}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </FormGrid>
      </Stack>

      <Stack direction="column" align="stretch" gap="2xs">
        <Header
          variant="section"
          icon="ArrowDownToLine"
          title="Auto-Scroll on AI Reply"
          subtitle="Control where the chat viewport scrolls when a new AI response arrives."
        />
        <FormGrid cols={3} gap="xs">
          {AUTOSCROLL_OPTIONS.map((opt) => {
            const isSelected = autoScrollBehavior === opt.id;
            return (
              <Card
                key={opt.id}
                as="button"
                type="button"
                variant="elevated"
                padding="xs"
                active={isSelected}
                hoverable
                onClick={() => setAutoScrollBehavior?.(opt.id)}
                aria-pressed={isSelected}
              >
                <Stack direction="column" align="stretch" gap="2xs">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                  >
                    <Stack direction="row" align="center" gap="xs">
                      <Text as="span" tone="accent">
                        <Icon name={opt.icon} size={14} />
                      </Text>
                      <Text
                        as="strong"
                        size="xs"
                        weight="semibold"
                        tone="primary"
                      >
                        {opt.title}
                      </Text>
                    </Stack>
                    {isSelected && (
                      <Badge variant="accent" size="xs">
                        Active
                      </Badge>
                    )}
                  </Stack>
                  <Text as="p" variant="caption" tone="secondary">
                    {opt.desc}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </FormGrid>
      </Stack>

      <Stack direction="column" align="stretch" gap="2xs">
        <Header
          variant="section"
          icon="Image"
          title="Image Generation"
          subtitle="Configure how scene renders are prompted, triggered, and replaced in chat."
        />
        <SwitchRow
          icon="Image"
          title="Review Image Prompt Before Generating"
          description="Show the prompt the text model wrote before it is sent to the image provider. Off sends it straight through."
          checked={imagePromptPreview}
          onChange={(e) => setImagePromptPreview?.(e.target.checked)}
        />
        <SwitchRow
          icon="Sparkles"
          title="Generate Image right after AI Response"
          description="Write and render an image for every completed turn. Costs one text call plus a render per turn — a local render takes minutes. With review on, the prompt modal still appears first."
          checked={autoImageAfterTurn}
          onChange={(e) => setAutoImageAfterTurn?.(e.target.checked)}
        />
        <SwitchRow
          icon="RefreshCw"
          title="Always Discard Old Image on Re-send"
          description="Skip the confirmation when an image's request body is sent again. The new render replaces the image it came from either way; with this off, that replacement is confirmed first."
          checked={alwaysDiscardOldImage}
          onChange={(e) => setAlwaysDiscardOldImage?.(e.target.checked)}
        />
      </Stack>

      <Stack direction="column" align="stretch" gap="2xs">
        <Header
          variant="section"
          icon="Wrench"
          title="Debugging"
          subtitle="Inspect raw prompt payloads, model responses, and state patches."
        />
        <SwitchRow
          icon="Wrench"
          title="Show Debug Accordion"
          description="Display the expandable raw prompt, response, and patch inspector"
          checked={showDebug}
          onChange={(e) => setShowDebug(e.target.checked)}
        />
      </Stack>
    </Stack>
  );
}

export default ChatSettingsPanel;
