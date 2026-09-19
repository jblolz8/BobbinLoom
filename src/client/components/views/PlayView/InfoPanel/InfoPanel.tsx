import { useState } from "react";
import type { Playthrough } from "../../../../../schemas";
import type { TokenUsage } from "../../../../api";
import { Tabs, type TabItem } from "../../../base";
import { PlayerTab } from "./PlayerTab";
import { CharsTab } from "./CharsTab";
import { JournalTab } from "./JournalTab";

type TabId = "player" | "chars" | "journal";

const INFO_TABS: TabItem<TabId>[] = [
  { id: "player", label: "Player", icon: "User" },
  { id: "chars", label: "Chars", icon: "Users" },
  { id: "journal", label: "Journal", icon: "BookOpen" },
];

export type InfoPanelProps = {
  playthrough: Playthrough;
  onPlaythroughChange: (updated: Playthrough) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  /** Ask to revert to an archived chapter; the confirm dialog lives one level up, in PlayView. */
  onRevertToChapter: (chapterId: string, chapterName: string) => void;
  /** Re-runs the summarizer on an archived chapter, and which chapter is mid-summarize. */
  onResummarizeChapter: (chapterId: string) => void;
  resummarizingChapterId: string | null;
  onStartNewWithSameScenario: (scenarioDescription: string, personaId: string | undefined, initialCastIds: string[] | undefined, originalName: string) => void;
  onOpenLibrary?: (templateId: string) => void;
  onOpenTimelines?: () => void;
  actionLoading: boolean;
  className?: string;
};

export function InfoPanel(props: InfoPanelProps) {
  const { playthrough, className } = props;
  const [activeTab, setActiveTab] = useState<TabId>("player");

  return (
    <aside className={`panel info-panel${className ? ` ${className}` : ""}`}>
      <div className="info-panel-tabs-header">
        <Tabs<TabId>
          tabs={INFO_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="enclosed"
          size="sm"
          fullWidth
        />
      </div>

      <div className="info-panel-body">
        {activeTab === "player" ? <PlayerTab playthrough={playthrough} /> : null}
        {activeTab === "chars" ? (
          <CharsTab
            playthrough={playthrough}
            onPlaythroughChange={props.onPlaythroughChange}
            onOpenLibrary={props.onOpenLibrary}
          />
        ) : null}
        {activeTab === "journal" ? (
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
        ) : null}
      </div>
    </aside>
  );
}
