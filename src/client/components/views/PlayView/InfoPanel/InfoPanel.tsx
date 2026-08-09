import { useState } from "react";
import type { Playthrough } from "../../../../../schemas";
import type { TokenUsage } from "../../../../api";
import { PlayerTab } from "./PlayerTab";
import { CharsTab } from "./CharsTab";
import { JournalTab } from "./JournalTab";

type TabId = "player" | "chars" | "journal";

export type InfoPanelProps = {
  playthrough: Playthrough;
  onPlaythroughChange: (updated: Playthrough) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  onStartNewWithSameScenario: (scenarioDescription: string, personaId: string | undefined, initialCastIds: string[] | undefined, originalName: string) => void;
  actionLoading: boolean;
  className?: string;
};

export function InfoPanel(props: InfoPanelProps) {
  const { playthrough, className } = props;
  const [activeTab, setActiveTab] = useState<TabId>("player");

  return (
    <aside className={`panel info-panel${className ? ` ${className}` : ""}`}>
      <nav className="panel-tabs">
        {(["player", "chars", "journal"] as TabId[]).map((tab) => (
          <button
            key={tab}
            className={`panel-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "chars" ? "Chars" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === "player" ? <PlayerTab playthrough={playthrough} /> : null}
      {activeTab === "chars" ? <CharsTab playthrough={playthrough} onPlaythroughChange={props.onPlaythroughChange} /> : null}
      {activeTab === "journal" ? (
        <JournalTab
          playthrough={playthrough}
          onPlaythroughChange={props.onPlaythroughChange}
          onViewChapter={props.onViewChapter}
          onCloseChapterComplete={props.onCloseChapterComplete}
          onStartNewWithSameScenario={props.onStartNewWithSameScenario}
        />
      ) : null}
    </aside>
  );
}
