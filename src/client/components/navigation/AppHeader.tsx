import { useState } from "react";
import type { HomeTab } from "../views/HomeView";

export type AppHeaderProps = {
  view: "home" | "play" | "setup";
  activeHomeTab: HomeTab;
  onSelectHomeTab: (tab: HomeTab) => void;
  activePlaythroughName?: string | null;
  onOpenModal: (modal: "playthroughs" | "characters" | "lorebooks" | "personas" | "settings") => void;
  onGoHome: () => void;
  onNewPlaythrough: () => void;
  onOpenSettings: () => void;
  isMobile?: boolean;
};

export function AppHeader({
  view,
  activeHomeTab,
  onSelectHomeTab,
  activePlaythroughName,
  onOpenModal,
  onGoHome,
  onNewPlaythrough,
  onOpenSettings,
  isMobile = false,
}: AppHeaderProps) {
  const [showPlayNavTabs, setShowPlayNavTabs] = useState(true);

  // On Desktop/Wide view (!isMobile): Nav tabs are always shown in the center.
  // On Mobile in Play View: Visibility is toggled by the Nav (⋮) button.
  const displayNavTabs = !isMobile || view !== "play" || showPlayNavTabs;

  return (
    <header className={`top-bar app-unified-header ${isMobile ? "is-mobile" : ""}`}>
      <div className="header-brand-group">
        <h1 className="header-logo" onClick={onGoHome} style={{ cursor: "pointer" }}>
          🧵 BobbinLoom
        </h1>
        {view === "play" && activePlaythroughName ? (
          <div className="active-playthrough-badge" title={`Active playthrough: ${activePlaythroughName}`}>
            <span className="badge-icon">📖</span>
            <span className="badge-name">{activePlaythroughName}</span>
          </div>
        ) : null}
      </div>

      {displayNavTabs && (
        <nav className="header-nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab-btn ${view === "home" && activeHomeTab === "playthroughs" ? "active" : ""}`}
            onClick={() => {
              if (view === "play") {
                onOpenModal("playthroughs");
              } else {
                onSelectHomeTab("playthroughs");
                if (view !== "home") onGoHome();
              }
            }}
          >
            <span className="tab-icon">🎮</span>
            <span className="tab-label">Playthroughs</span>
          </button>

          <button
            className={`nav-tab-btn ${view === "home" && activeHomeTab === "characters" ? "active" : ""}`}
            onClick={() => {
              if (view === "play") {
                onOpenModal("characters");
              } else {
                onSelectHomeTab("characters");
                if (view !== "home") onGoHome();
              }
            }}
          >
            <span className="tab-icon">👥</span>
            <span className="tab-label">Characters</span>
          </button>

          <button
            className={`nav-tab-btn ${view === "home" && activeHomeTab === "lorebooks" ? "active" : ""}`}
            onClick={() => {
              if (view === "play") {
                onOpenModal("lorebooks");
              } else {
                onSelectHomeTab("lorebooks");
                if (view !== "home") onGoHome();
              }
            }}
          >
            <span className="tab-icon">📚</span>
            <span className="tab-label">Lorebooks</span>
          </button>

          <button
            className={`nav-tab-btn ${view === "home" && activeHomeTab === "personas" ? "active" : ""}`}
            onClick={() => {
              if (view === "play") {
                onOpenModal("personas");
              } else {
                onSelectHomeTab("personas");
                if (view !== "home") onGoHome();
              }
            }}
          >
            <span className="tab-icon">👤</span>
            <span className="tab-label">Personas</span>
          </button>
        </nav>
      )}

      <div className="top-actions">
        {view === "play" || view === "setup" ? (
          <button onClick={onGoHome} title="Return to Home">
            <span className="btn-label">← Home</span>
            <span className="btn-icon" aria-hidden="true">🏠</span>
          </button>
        ) : null}

        {view !== "setup" ? (
          <button className="primary-btn new-playthrough-btn" onClick={onNewPlaythrough}>
            <span className="btn-label">+ New Playthrough</span>
            <span className="btn-icon" aria-hidden="true">✚</span>
          </button>
        ) : null}

        <button className="settings-btn" onClick={onOpenSettings} title="Settings">
          <span className="btn-label">Settings</span>
          <span className="btn-icon" aria-hidden="true">⚙</span>
        </button>

        {view === "play" && isMobile ? (
          <button
            className={`options-toggle-btn ${showPlayNavTabs ? "active" : ""}`}
            onClick={() => setShowPlayNavTabs((prev) => !prev)}
            title={showPlayNavTabs ? "Hide navigation bar" : "Show navigation bar"}
            aria-label="Toggle navigation bar"
            aria-expanded={showPlayNavTabs}
          >
            <span className="btn-label">Nav</span>
            <span className="btn-icon" aria-hidden="true">⋮</span>
          </button>
        ) : null}
      </div>

      {view === "play" && activePlaythroughName ? (
        <div className="playthrough-title-banner" title={`Active playthrough: ${activePlaythroughName}`}>
          <span className="banner-icon">📖</span>
          <span className="banner-text">{activePlaythroughName}</span>
        </div>
      ) : null}
    </header>
  );
}
