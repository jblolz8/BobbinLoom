import { useEffect, useRef, useState } from "react";
import type { ViewPreferences } from "../../../schemas";
import type { HomeTab } from "../views/HomeView";
import {
  NAV_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveNavPreferences,
  updateViewPreferences,
} from "../../api";
import {
  Badge,
  Button,
  Header,
  Tabs,
  ThreadIcon,
  Tooltip,
  type TabItem,
} from "../base";

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

const NAV_TABS: TabItem<HomeTab>[] = [
  { id: "playthroughs", label: "Playthroughs", icon: "Gamepad2" },
  { id: "characters", label: "Characters", icon: "Users" },
  { id: "lorebooks", label: "Lorebooks", icon: "BookMarked" },
  { id: "personas", label: "Personas", icon: "User" },
  { id: "docs", label: "Docs", icon: "BookText" },
];

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

  const handleSelectNavTab = (tab: HomeTab) => {
    if (view === "play") {
      if (tab === "docs") {
        onOpenDocs();
      } else {
        onOpenModal(tab);
      }
      return;
    }
    onSelectHomeTab(tab);
    if (view !== "home") onGoHome();
  };

  // On Desktop/Wide view (!isMobile): Nav tabs are always shown in the center.
  // On Mobile in Play View: Visibility is toggled by the Nav (⋮) button.
  const displayNavTabs = !isMobile || view !== "play" || showPlayNavTabs;
  const isCompact = isMobile && view === "play";

  return (
    <Header variant="app" compact={isCompact}>
      <Header.Brand
        icon={<ThreadIcon size={22} />}
        title="BobbinLoom"
        onClick={onGoHome}
      >
        {view === "play" && activePlaythroughName ? (
          <Tooltip content={`Active Playthrough: ${activePlaythroughName}`} side="bottom">
            <Badge
              variant="accent"
              size="sm"
              pill
              truncate
              maxWidth={240}
              leftIcon="BookOpen"
            >
              {activePlaythroughName}
            </Badge>
          </Tooltip>
        ) : null}
      </Header.Brand>

      {displayNavTabs && (
        <Header.Nav ariaLabel="Main Navigation">
          <Tabs
            tabs={NAV_TABS}
            activeTab={view === "home" ? activeHomeTab : null}
            onChange={handleSelectNavTab}
            variant="segmented"
            size="sm"
            allowReselect={view !== "home"}
            ariaLabel="Main Navigation"
          />
        </Header.Nav>
      )}

      <Header.Actions>
        {view === "play" || view === "setup" ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon="Home"
            collapseBelow={isCompact ? "always" : "xs"}
            tooltip="Return to Home"
            tooltipSide="bottom"
            onClick={onGoHome}
            aria-label="Return to Home"
          >
            Home
          </Button>
        ) : null}

        {view !== "setup" ? (
          <Button
            variant="primary"
            size="sm"
            leftIcon="Plus"
            collapseBelow={isCompact ? "always" : "xs"}
            tooltip="New Playthrough"
            tooltipSide="bottom"
            onClick={onNewPlaythrough}
            aria-label="New Playthrough"
          >
            New Playthrough
          </Button>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          leftIcon="Settings"
          collapseBelow={isCompact ? "always" : "sm"}
          tooltip="Settings"
          tooltipSide="bottom"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          Settings
        </Button>

        {view === "play" && isMobile ? (
          <Button
            variant={showPlayNavTabs ? "secondary" : "ghost"}
            size="sm"
            active={showPlayNavTabs}
            leftIcon="MoreVertical"
            collapseBelow="always"
            tooltip={showPlayNavTabs ? "Hide navigation bar" : "Show navigation bar"}
            tooltipSide="bottom"
            onClick={handleTogglePlayNavTabs}
            aria-label="Toggle navigation bar"
            aria-expanded={showPlayNavTabs}
          >
            Nav
          </Button>
        ) : null}
      </Header.Actions>
    </Header>
  );
}
