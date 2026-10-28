import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  incomingOffset,
   type MobilePane,
  PANE_ORDER,
  paneIndexOf,
  paneSide,
} from "../../../engine/paneSwipe";
import { usePaneSwipe } from "../../../hooks/usePaneSwipe";
import { Icon, PageShell } from "../../base";
import "./PlayWorkspace.css";

const WORKSPACE_PANE_BREAKPOINT = 1100;
const PANE_SETTLE_MS = 220;

export type PlayWorkspacePaneRenderProps = {
  className?: string;
  style?: CSSProperties;
};

export interface PlayWorkspaceProps {
  isMobile: boolean;
  activePane: MobilePane;
  onSelectPane: (pane: MobilePane) => void;
  paneSwipeEnabled?: boolean;
  topBanner?: ReactNode;
  renderScenePane: (props: PlayWorkspacePaneRenderProps) => ReactNode;
  renderChatPane: (props: PlayWorkspacePaneRenderProps) => ReactNode;
  renderInfoPane: (props: PlayWorkspacePaneRenderProps) => ReactNode;
  children?: ReactNode;
}

export function PlayWorkspace({
  isMobile,
  activePane,
  onSelectPane,
  paneSwipeEnabled = true,
  topBanner,
  renderScenePane,
  renderChatPane,
  renderInfoPane,
  children,
}: PlayWorkspaceProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const layoutRef = useRef<HTMLElement | null>(null);
  const [isNarrowContainer, setIsNarrowContainer] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => {
      const width = el.clientWidth;
      setIsNarrowContainer(width > 0 && width <= WORKSPACE_PANE_BREAKPOINT);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isSinglePane = isMobile || isNarrowContainer;

  const paneMove = useRef<{ to: string; side: "left" | "right" }>({
    to: activePane,
    side: "right",
  });
  const draggedInto = useRef<string | null>(null);
  if (paneMove.current.to !== activePane) {
    paneMove.current = {
      to: activePane,
      side: paneSide(paneIndexOf(paneMove.current.to), paneIndexOf(activePane)),
    };
    if (draggedInto.current !== activePane) draggedInto.current = null;
  }

  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const [paneDrag, setPaneDrag] = useState<{
    target: MobilePane;
    offset: number;
    released: boolean;
  } | null>(null);
  const settleTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const paneSwipe = usePaneSwipe({
    enabled: isSinglePane && paneSwipeEnabled,
    live: !reducedMotion,
    index: paneIndexOf(activePane),
    paneWidth: () => layoutRef.current?.clientWidth ?? 0,
    onDrag: (drag) => {
      if (!drag) {
        setPaneDrag(null);
        return;
      }
      const target = PANE_ORDER[drag.targetIndex];
      if (!target) return;
      setPaneDrag({ target, offset: drag.offset, released: false });
    },
    onSettle: ({ targetIndex, committed }) => {
      const target = PANE_ORDER[targetIndex];
      if (!target) {
        setPaneDrag(null);
        return;
      }
      const width = layoutRef.current?.clientWidth ?? 0;
      const rest = committed
        ? targetIndex > paneIndexOf(activePane)
          ? -width
          : width
        : 0;
      setPaneDrag({ target, offset: rest, released: true });
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        if (committed) {
          draggedInto.current = target;
          onSelectPane(target);
        } else {
          draggedInto.current = activePane;
        }
        setPaneDrag(null);
      }, PANE_SETTLE_MS);
    },
  });

  function paneLayout(pane: MobilePane): PlayWorkspacePaneRenderProps {
    if (!isSinglePane) return {};
    if (paneDrag) {
      const settled = paneDrag.released ? " pane-settling" : "";
      if (pane === activePane) {
        return {
          className: `pane-dragging${settled}`,
          style: { transform: `translateX(${paneDrag.offset}px)` },
        };
      }
      if (pane === paneDrag.target) {
        const width = layoutRef.current?.clientWidth ?? 0;
        const offset = incomingOffset(
          paneDrag.offset,
          paneIndexOf(activePane),
          paneIndexOf(paneDrag.target),
          width,
        );
        return {
          className: `pane-dragging${settled}`,
          style: { transform: `translateX(${offset}px)` },
        };
      }
      return { className: "mobile-hidden" };
    }
    if (activePane !== pane) return { className: "mobile-hidden" };
    return draggedInto.current === pane
      ? {}
      : { className: `pane-enter-from-${paneMove.current.side}` };
  }

  return (
    <PageShell
      className={`app-shell play-view-shell${isSinglePane ? " play-view-shell--single" : ""}`}
    >
      <PageShell.Section
        ref={sectionRef}
        flush
        className={`play-workspace${isSinglePane ? " play-workspace--single" : ""}`}
      >
        {topBanner}

        <section
          className={`layout${isSinglePane ? " layout--single" : ""}`}
          ref={layoutRef}
          {...paneSwipe}
        >
          {renderScenePane(paneLayout("scene"))}
          {renderChatPane(paneLayout("chat"))}
          {renderInfoPane(paneLayout("info"))}
        </section>

        {isSinglePane ? (
          <nav
            className="mobile-tab-bar"
            aria-label="Mobile View Panels Navigation"
            role="tablist"
          >
            <button
              role="tab"
              type="button"
              className={`mobile-tab ${activePane === "scene" ? "active" : ""}`}
              onClick={() => onSelectPane("scene")}
              aria-label="Scene view"
              aria-selected={activePane === "scene"}
            >
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name="Compass" size={16} />
              </span>
              <span className="mobile-tab-label">Scene</span>
            </button>
            <button
              role="tab"
              type="button"
              className={`mobile-tab ${activePane === "chat" ? "active" : ""}`}
              onClick={() => onSelectPane("chat")}
              aria-label="Chat view"
              aria-selected={activePane === "chat"}
            >
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name="MessageSquare" size={16} />
              </span>
              <span className="mobile-tab-label">Chat</span>
            </button>
            <button
              role="tab"
              type="button"
              className={`mobile-tab ${activePane === "info" ? "active" : ""}`}
              onClick={() => onSelectPane("info")}
              aria-label="Info view"
              aria-selected={activePane === "info"}
            >
              <span className="mobile-tab-icon" aria-hidden="true">
                <Icon name="BookOpen" size={16} />
              </span>
              <span className="mobile-tab-label">Info</span>
            </button>
          </nav>
        ) : null}
      </PageShell.Section>

      {children}
    </PageShell>
  );
}

export default PlayWorkspace;
