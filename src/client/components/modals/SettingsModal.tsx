import { useState } from "react";
import type { PlaythroughPromptSettings } from "../../api";
import { PresetEditor } from "./PresetEditor";
import { ProviderConnections } from "./ProviderConnections";
import { TagTaxonomyPanel } from "../library/TagTaxonomyModal";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { Icon } from "../base";

type SettingsTab = "provider" | "prompts" | "tags" | "chat" | "appearance";

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  playthroughId: string | null;
  playthroughPromptSettings: PlaythroughPromptSettings | null;
  onPlaythroughPromptSettings: (updated: PlaythroughPromptSettings) => void;
  choicesEnabled: boolean;
  setChoicesEnabled: (enabled: boolean) => void;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  showContextUsage: boolean;
  setShowContextUsage: (show: boolean) => void;
};

export function SettingsModal(props: SettingsModalProps) {
  const {
    open,
    onClose,
    playthroughId,
    playthroughPromptSettings,
    onPlaythroughPromptSettings,
    choicesEnabled,
    setChoicesEnabled,
    showDebug,
    setShowDebug,
    showContextUsage,
    setShowContextUsage
  } = props;
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("provider");

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal-wide">
        <header className="modal-header">
          <div>
            <h2>Settings</h2>
          </div>
          <button className="flex items-center gap-1" onClick={onClose}><Icon name="X" size={16} /> Close</button>
        </header>
        <div className="settings-tabs">
          <button className={`tab ${settingsTab === "provider" ? "active" : ""}`} onClick={() => setSettingsTab("provider")}>
            Provider
          </button>
          <button className={`tab ${settingsTab === "prompts" ? "active" : ""}`} onClick={() => setSettingsTab("prompts")}>
            Prompt Configuration
          </button>
          <button className={`tab ${settingsTab === "tags" ? "active" : ""}`} onClick={() => setSettingsTab("tags")}>
            Tags &amp; Taxonomy
          </button>
          <button className={`tab ${settingsTab === "chat" ? "active" : ""}`} onClick={() => setSettingsTab("chat")}>
            Chat
          </button>
          <button className={`tab ${settingsTab === "appearance" ? "active" : ""}`} onClick={() => setSettingsTab("appearance")}>
            Appearance
          </button>
        </div>
        {settingsTab === "provider" ? (
          <ProviderConnections />
        ) : settingsTab === "prompts" ? (
          <PresetEditor
            playthroughId={playthroughId}
            playthroughPromptSettings={playthroughPromptSettings}
            onPlaythroughPromptSettings={onPlaythroughPromptSettings}
          />
        ) : settingsTab === "tags" ? (
          <div className="settings-tab-panel" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>
            <TagTaxonomyPanel />
          </div>
        ) : settingsTab === "appearance" ? (
          <div className="settings-tab-panel" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>
            <AppearanceSettingsPanel />
          </div>
        ) : (
          <div className="chat-settings-group">
            <p className="chat-settings-intro">
              Customize which components and visual indicators appear in the Chat panel.
            </p>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="MessageSquare" size={20} className="text-blue-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Show Choices</span>
                  <span className="chat-setting-desc">Display suggested action choice buttons below turn responses</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={choicesEnabled}
                  onChange={(e) => setChoicesEnabled(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="BarChart2" size={20} className="text-emerald-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Show Context Usage</span>
                  <span className="chat-setting-desc">Display the Context Meter token and memory usage indicator</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showContextUsage}
                  onChange={(e) => setShowContextUsage(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="Wrench" size={20} className="text-amber-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Show Debug Accordion</span>
                  <span className="chat-setting-desc">Display the expandable raw prompt, response, and patch inspector</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showDebug}
                  onChange={(e) => setShowDebug(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
