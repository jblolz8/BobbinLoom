import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { Playthrough } from "../../../../../schemas";
import type { TokenUsage } from "../../../../api";
import { Badge, Tabs, type TabItem } from "../../../base";
import { PlayerTab } from "./PlayerTab";
import { CharsTab } from "./CharsTab";
import { JournalTab } from "./JournalTab";

type TabId = "player" | "chars" | "journal";

export type InfoPanelProps = {
  playthrough: Playthrough;
  onPlaythroughChange: (
    updated: Playthrough | ((prev: Playthrough) => Playthrough),
  ) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  /** Ask to revert to an archived chapter; the confirm dialog lives one level up, in PlayView. */
  onRevertToChapter: (chapterId: string, chapterName: string) => void;
  /** Re-runs the summarizer on an archived chapter, and which chapter is mid-summarize. */
  onResummarizeChapter: (chapterId: string) => void;
  resummarizingChapterId: string | null;
  onStartNewWithSameScenario: (
    scenarioDescription: string,
    personaId: string | undefined,
    initialCastIds: string[] | undefined,
    originalName: string,
  ) => void;
  onOpenLibrary?: (templateId: string) => void;
  onOpenTimelines?: () => void;
  actionLoading: boolean;
  imagePromptPreview?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function InfoPanel(props: InfoPanelProps) {
  const { playthrough, className, style } = props;
  const [activeTab, setActiveTab] = useState<TabId>("player");

  const activeCharsCount = (playthrough.activeCharacters ?? []).length;

  const infoTabs = useMemo<TabItem<TabId>[]>(
    () => [
      { id: "player", label: "Player", icon: "User" },
      {
        id: "chars",
        label: "Chars",
        icon: "Users",
        badge:
          activeCharsCount > 0 ? (
            <Badge
              variant={activeTab === "chars" ? "accent" : "neutral"}
              size="xs"
              pill
            >
              {activeCharsCount}
            </Badge>
          ) : undefined,
      },
      { id: "journal", label: "Journal", icon: "BookOpen" },
    ],
    [activeCharsCount, activeTab],
  );

  return (
    <aside
      className={`panel info-panel${className ? ` ${className}` : ""}`}
      style={style}
    >
      <div className="info-panel-tabs-header">
        <Tabs<TabId>
          tabs={infoTabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="segmented"
          size="sm"
          fullWidth
          ariaLabel="Info Panel Sections"
        />
      </div>

      <div className="info-panel-body">
        <Tabs.Panel active={activeTab === "player"}>
          <PlayerTab
            playthrough={playthrough}
            onPlaythroughChange={props.onPlaythroughChange}
          />
        </Tabs.Panel>
        <Tabs.Panel active={activeTab === "chars"}>
          <CharsTab
            playthrough={playthrough}
            onPlaythroughChange={props.onPlaythroughChange}
            onOpenLibrary={props.onOpenLibrary}
            imagePromptPreview={props.imagePromptPreview}
          />
        </Tabs.Panel>
        <Tabs.Panel active={activeTab === "journal"}>
          <JournalTab
            playthrough={playthrough}
            onPlaythroughChange={props.onPlaythroughChange}
            onViewChapter={props.onViewChapter}
            onCloseChapterComplete={props.onCloseChapterComplete}
            onRevertToChapter={props.onRevertToChapter}
            onResummarizeChapter={props.onResummarizeChapter}
            resummarizingChapterId={props.resummarizingChapterId}
            onStartNewWithSameScenario={props.onStartNewWithSameScenario}
            onOpenTimelines={props.onOpenTimelines}
          />
        </Tabs.Panel>
      </div>
    </aside>
  );
}
