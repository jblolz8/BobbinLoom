import { useEffect, useRef, useState } from "react";
import type { ViewPreferences } from "../../../schemas";
import type { HomeTab } from "../views/HomeView";
import {
  NAV_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveNavPreferences,
  updateViewPreferences
} from "../../api";
import { Button, Icon, Tooltip, ThreadIcon } from "../base";

export type AppHeaderProps = {
  view: "home" | "play" | "setup";
  activeHomeTab: HomeTab;
  onSelectHomeTab: (tab: HomeTab) => void;
  activePlaythroughName?: string | null;
  onOpenModal: (modal: "playthroughs" | "characters" | "lorebooks" | "personas" | "settings") => void;
  onGoHome: () => void;
  onNewPlaythrough: () => void;
  onOpenSettings: () => void;
  /** Docs open as a dialog while a playthrough is on screen, where the other
   *  nav tabs open their managers; on Home they are a workspace tab. */
  onOpenDocs: () => void;
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
  onOpenDocs,
  isMobile = false,
}: AppHeaderProps) {
  const [showPlayNavTabs, setShowPlayNavTabs] = useState<boolean>(
    NAV_PREFERENCE_DEFAULTS.showPlayNavTabs
  );

  /** Set the moment the reader toggles it, so the read that lands later never overwrites what they
   *  just chose. */
  const navTouchedRef = useRef(false);

  /** The sole writer for this preference: state first so the toggle feels instant, then the server.
   *  The device keeps nothing. */
  const writeNavPreference = (patch: ViewPreferences["nav"]) => {
    navTouchedRef.current = true;
    void updateViewPreferences({ nav: patch }).catch(() => {
      /* The next read reconciles; a failed write must not break the toggle. */
    });
  };

  // This preference lives on the server now (adopting whatever this device still holds first), so it
  // arrives after the first paint — the toggle simply starts on the default until it does.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled || navTouchedRef.current) return;
      setShowPlayNavTabs(resolveNavPreferences(preferences).showPlayNavTabs);
    })().catch(() => {
      /* A failed read leaves the default; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTogglePlayNavTabs = () => {
    const next = !showPlayNavTabs;
    setShowPlayNavTabs(next);
    writeNavPreference({ showPlayNavTabs: next });
  };

  // On Desktop/Wide view (!isMobile): Nav tabs are always shown in the center.
  // On Mobile in Play View: Visibility is toggled by the Nav (⋮) button.
  const displayNavTabs = !isMobile || view !== "play" || showPlayNavTabs;

  return (
    <header className={`top-bar app-unified-header view-${view} ${isMobile && view === "play" ? "is-mobile" : ""}`}>
      <div className="header-brand-group">
        <h1 className="header-logo flex items-center gap-2" onClick={onGoHome} style={{ cursor: "pointer" }}>
          <span className="logo-emoji flex items-center"><ThreadIcon size={22} /></span>
          <span className="logo-text">BobbinLoom</span>
        </h1>
        {view === "play" && activePlaythroughName ? (
          <div className="active-playthrough-badge flex items-center gap-1.5" title={`Active playthrough: ${activePlaythroughName}`}>
            <span className="badge-icon"><Icon name="BookOpen" size={15} /></span>
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
            <span className="tab-icon"><Icon name="Gamepad2" size={15} /></span>
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
            <span className="tab-icon"><Icon name="Users" size={15} /></span>
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
            <span className="tab-icon"><Icon name="BookMarked" size={15} /></span>
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
            <span className="tab-icon"><Icon name="User" size={15} /></span>
            <span className="tab-label">Personas</span>
          </button>

          <button
            className={`nav-tab-btn ${view === "home" && activeHomeTab === "docs" ? "active" : ""}`}
            onClick={() => {
              if (view === "play") {
                onOpenDocs();
              } else {
                onSelectHomeTab("docs");
                if (view !== "home") onGoHome();
              }
            }}
          >
            <span className="tab-icon"><Icon name="BookText" size={15} /></span>
            <span className="tab-label">Docs</span>
          </button>
        </nav>
      )}

      <div className="top-actions">
        {view === "play" || view === "setup" ? (
          <Tooltip content="Return to Home" side="bottom">
            <Button variant="secondary" size="sm" onClick={onGoHome} aria-label="Return to Home">
              <span className="btn-label flex items-center gap-1.5"><Icon name="Home" size={15} /> Home</span>
              <span className="btn-icon" aria-hidden="true"><Icon name="Home" size={16} /></span>
            </Button>
          </Tooltip>
        ) : null}

        {view !== "setup" ? (
          <Button variant="primary" size="sm" className="new-playthrough-btn" onClick={onNewPlaythrough}>
            <span className="btn-label flex items-center gap-1.5"><Icon name="Plus" size={15} /> New Playthrough</span>
            <span className="btn-icon" aria-hidden="true"><Icon name="Plus" size={16} /></span>
          </Button>
        ) : null}

        <Tooltip content="Settings" side="bottom">
          <Button variant="secondary" size="sm" className="settings-btn" onClick={onOpenSettings} aria-label="Settings">
            <span className="btn-label flex items-center gap-1.5"><Icon name="Settings" size={15} /> Settings</span>
            <span className="btn-icon" aria-hidden="true"><Icon name="Settings" size={16} /></span>
          </Button>
        </Tooltip>

        {view === "play" && isMobile ? (
          <Tooltip content={showPlayNavTabs ? "Hide navigation bar" : "Show navigation bar"} side="bottom">
            <Button
              variant={showPlayNavTabs ? "secondary" : "ghost"}
              size="sm"
              className={`options-toggle-btn ${showPlayNavTabs ? "active" : ""}`}
              onClick={handleTogglePlayNavTabs}
              aria-label="Toggle navigation bar"
              aria-expanded={showPlayNavTabs}
            >
              <span className="btn-label flex items-center gap-1.5"><Icon name="MoreVertical" size={15} /> Nav</span>
              <span className="btn-icon" aria-hidden="true"><Icon name="MoreVertical" size={16} /></span>
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </header>
  );
}
