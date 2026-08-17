import { useEffect, useState } from "react";
import type { AvatarShape } from "../../../schemas";
import { applyAvatarShapeTheme, getAppearanceSettings, updateAppearanceSettings } from "../../api";
import { AvatarBadge, Icon } from "../base";

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

export function AppearanceSettingsPanel() {
  const [avatarShape, setAvatarShape] = useState<AvatarShape>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_avatar_shape");
      if (saved === "square" || saved === "rounded" || saved === "circle") return saved;
    }
    return "rounded";
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    getAppearanceSettings()
      .then((res) => {
        if (res.avatarShape) {
          setAvatarShape(res.avatarShape);
          applyAvatarShapeTheme(res.avatarShape);
        }
      })
      .catch(() => {
        /* fallback to localStorage */
      });
  }, []);

  async function handleSelectShape(shape: AvatarShape) {
    setAvatarShape(shape);
    applyAvatarShapeTheme(shape);
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateAppearanceSettings({ avatarShape: shape });
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("Failed to save to server (saved locally)");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="appearance-settings-panel">
      <div className="appearance-section-header">
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Sparkles" size={17} className="text-blue-400" />
            <span>Avatar Badge Shape</span>
          </h3>
          <p className="appearance-section-desc">
            Choose the shape for entity identity badges across the Player tab, Main Cast compact roster, Background NPCs, and Persona selectors.
          </p>
        </div>
        {saveStatus && <span className="appearance-save-status">{saveStatus}</span>}
      </div>

      {/* Shape Selector Cards */}
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

      {/* Live Interactive Preview */}
      <div className="appearance-live-preview-box">
        <div className="preview-box-header">
          <Icon name="Eye" size={14} className="text-emerald-400" />
          <span>Live Interface Preview</span>
          <span className="preview-active-shape-tag">Shape: {avatarShape}</span>
        </div>

        <div className="preview-mockup-row">
          {/* Mock Player */}
          <div className="preview-mockup-item">
            <AvatarBadge icon="User" name="Player" size="md" />
            <div className="mockup-meta">
              <span className="mockup-name">Player Character</span>
              <span className="mockup-sub">Player Tab Header</span>
            </div>
          </div>

          {/* Mock Cast */}
          <div className="preview-mockup-item">
            <AvatarBadge name="Mira" size="md" />
            <div className="mockup-meta">
              <span className="mockup-name">Mira Vane</span>
              <span className="mockup-sub">Main Cast (Compact)</span>
            </div>
          </div>

          {/* Mock NPC */}
          <div className="preview-mockup-item">
            <AvatarBadge name="Barkeep" size="sm" />
            <div className="mockup-meta">
              <span className="mockup-name">Barkeep</span>
              <span className="mockup-sub">Background NPC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
