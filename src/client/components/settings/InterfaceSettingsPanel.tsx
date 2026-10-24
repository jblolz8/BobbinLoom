import { useEffect, useState } from "react";
import type { AvatarShape, CoverAspect } from "../../../schemas";
import {
  applyAvatarShapeTheme,
  applyCoverAspect,
  getAppearanceSettings,
  updateAppearanceSettings,
} from "../../api";
import { AvatarBadge, Icon, SwitchRow } from "../base";

const SHAPE_OPTIONS: Array<{
  id: AvatarShape;
  title: string;
  desc: string;
  badgePreviewShape: AvatarShape;
}> = [
  {
    id: "square",
    title: "Square",
    desc: "Crisp straight edges with minimal corner softening",
    badgePreviewShape: "square",
  },
  {
    id: "rounded",
    title: "Rounded Corner Square",
    desc: "Balanced modern rounded corners (Default)",
    badgePreviewShape: "rounded",
  },
  {
    id: "circle",
    title: "Circle",
    desc: "Smooth classic circular avatar badges",
    badgePreviewShape: "circle",
  },
];

/** The three cover frame shapes, in the order they are offered. Each previews its own ratio so
 *  the choice reads without knowing what "2:3" looks like. */
const ASPECT_OPTIONS: Array<{
  id: CoverAspect;
  title: string;
  desc: string;
}> = [
  {
    id: "landscape",
    title: "Landscape",
    desc: "16:9 — the widest banner; suits wide renders and keeps a long shelf compact (Default)",
  },
  {
    id: "square",
    title: "1:1 Square",
    desc: "Square — the shape most image models return, so nothing is cropped",
  },
  {
    id: "portrait",
    title: "Portrait",
    desc: "2:3 — tallest frame; suits character art",
  },
];

export function InterfaceSettingsPanel() {
  // Initial values are the shipped defaults: the server paints these tokens into the first frame and
  // the GET below fills the controls, so the device cache is gone (it desynced across devices).
  const [avatarShape, setAvatarShape] = useState<AvatarShape>("rounded");
  const [coverAspect, setCoverAspect] = useState<CoverAspect>("landscape");

  /** The play view's panel swipe. The panel is the switch's owner; the play view reads the same
   *  setting to decide whether the gesture exists. Nothing is cached locally — see the note on
   *  `AppearanceSettings.paneSwipeEnabled`. */
  const [paneSwipeEnabled, setPaneSwipeEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    getAppearanceSettings()
      .then((res) => {
        if (res.avatarShape) {
          setAvatarShape(res.avatarShape);
          applyAvatarShapeTheme(res.avatarShape);
        }
        if (res.coverAspect) {
          setCoverAspect(res.coverAspect);
          applyCoverAspect(res.coverAspect);
        }
        if (typeof res.paneSwipeEnabled === "boolean") {
          setPaneSwipeEnabled(res.paneSwipeEnabled);
        }
      })
      .catch(() => {
        /* fallback to state defaults */
      });
  }, []);

  async function persistInterfaceSettings(updates: {
    avatarShape?: AvatarShape;
    coverAspect?: CoverAspect;
    paneSwipeEnabled?: boolean;
  }) {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateAppearanceSettings(updates);
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("Saved locally (server sync failed)");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectShape(shape: AvatarShape) {
    setAvatarShape(shape);
    applyAvatarShapeTheme(shape);
    void persistInterfaceSettings({ avatarShape: shape });
  }

  function handleSelectAspect(aspect: CoverAspect) {
    setCoverAspect(aspect);
    applyCoverAspect(aspect);
    void persistInterfaceSettings({ coverAspect: aspect });
  }

  function handleTogglePaneSwipe(enabled: boolean) {
    setPaneSwipeEnabled(enabled);
    void persistInterfaceSettings({ paneSwipeEnabled: enabled });
  }

  return (
    <div className="appearance-settings-panel">
      {/* ── Avatar Badge Shape Section ── */}
      <div className="appearance-section-header">
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Sparkles" size={17} />
            <span>Avatar Badge Shape</span>
          </h3>
          <p className="appearance-section-desc">
            Choose the shape for entity identity badges across the Player tab, Main Cast compact roster, Background NPCs, and Persona selectors.
          </p>
        </div>
        {saveStatus && <span className="appearance-save-status">{saveStatus}</span>}
      </div>

      <div className="avatar-shape-selector-grid">
        {SHAPE_OPTIONS.map((opt) => {
          const isSelected = avatarShape === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`shape-option-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => void handleSelectShape(opt.id)}
              disabled={saving}
            >
              <div className="shape-card-top">
                <div className="shape-card-preview">
                  <AvatarBadge
                    name="Mira"
                    size="lg"
                    shape={opt.badgePreviewShape}
                    className="shape-demo-avatar"
                  />
                </div>
                <div className="shape-radio-indicator">
                  <span className={`radio-dot ${isSelected ? "checked" : ""}`} />
                </div>
              </div>

              <div className="shape-card-body">
                <strong className="shape-title">{opt.title}</strong>
                <p className="shape-desc">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Cover Art Section ── */}
      <div className="appearance-section-header" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Image" size={17} />
            <span>Cover Art</span>
          </h3>
          <p className="appearance-section-desc">
            Choose the shape of every cover on the playthrough shelf. A cover fills its frame, so
            picking the shape that matches the images your stories produce crops the least.
          </p>
        </div>
      </div>

      <div className="avatar-shape-selector-grid">
        {ASPECT_OPTIONS.map((opt) => {
          const isSelected = coverAspect === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`shape-option-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => handleSelectAspect(opt.id)}
              disabled={saving}
            >
              <div className="shape-card-top">
                <div className="shape-card-preview">
                  <span className="cover-aspect-preview" data-aspect={opt.id} />
                </div>
                <div className="shape-radio-indicator">
                  <span className={`radio-dot ${isSelected ? "checked" : ""}`} />
                </div>
              </div>

              <div className="shape-card-body">
                <strong className="shape-title">{opt.title}</strong>
                <p className="shape-desc">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Mobile Panels Section ──
          Offered only where the single-panel layout exists: above the app's breakpoint every panel is
          already on screen and the tab bar is gone, so the row is hidden by CSS rather than rendered
          conditionally — the panel keeps one markup path. */}
      <div className="appearance-section-header pane-swipe-setting" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="MoveHorizontal" size={17} />
            <span>Mobile Panels</span>
          </h3>
          <p className="appearance-section-desc">
            How the play view moves between Scene, Chat and Info on a narrow screen.
          </p>
        </div>
      </div>

      <div className="pane-swipe-setting" style={{ marginBottom: "0.5rem" }}>
        <SwitchRow
          icon="MoveHorizontal"
          title="Swipe Between Panels"
          description="Drag horizontally to move between the panels. The bottom tab bar always works; turn this off if a scroll that drifts sideways keeps pulling a panel with it."
          checked={paneSwipeEnabled}
          onChange={(e) => handleTogglePaneSwipe(e.target.checked)}
          disabled={saving}
        />
      </div>
    </div>
  );
}
