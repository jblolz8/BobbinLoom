import { useEffect, useRef, useState } from "react";
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
  showGenerationTime?: boolean;
  setShowGenerationTime?: (show: boolean) => void;
  showMessageTimestamps?: boolean;
  setShowMessageTimestamps?: (show: boolean) => void;
  showModelName?: boolean;
  setShowModelName?: (show: boolean) => void;
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
    setShowContextUsage,
    showGenerationTime = true,
    setShowGenerationTime,
    showMessageTimestamps = true,
    setShowMessageTimestamps,
    showModelName = true,
    setShowModelName,
  } = props;
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("provider");
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = tabsRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
          el.scrollLeft += delta;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal-wide">
        <header className="modal-header">
          <div>
            <h2>Settings</h2>
          </div>
          <button className="flex items-center gap-1 modal-close-btn" onClick={onClose} aria-label="Close Settings"><Icon name="X" size={16} /> Close</button>
        </header>
        <div className="settings-tabs" role="tablist" ref={tabsRef}>
          <button role="tab" aria-selected={settingsTab === "provider"} className={`tab ${settingsTab === "provider" ? "active" : ""}`} onClick={() => setSettingsTab("provider")}>
            Provider
          </button>
          <button role="tab" aria-selected={settingsTab === "prompts"} className={`tab ${settingsTab === "prompts" ? "active" : ""}`} onClick={() => setSettingsTab("prompts")}>
            Prompt Configuration
          </button>
          <button role="tab" aria-selected={settingsTab === "tags"} className={`tab ${settingsTab === "tags" ? "active" : ""}`} onClick={() => setSettingsTab("tags")}>
            Tags &amp; Taxonomy
          </button>
          <button role="tab" aria-selected={settingsTab === "chat"} className={`tab ${settingsTab === "chat" ? "active" : ""}`} onClick={() => setSettingsTab("chat")}>
            Chat
          </button>
          <button role="tab" aria-selected={settingsTab === "appearance"} className={`tab ${settingsTab === "appearance" ? "active" : ""}`} onClick={() => setSettingsTab("appearance")}>
            Appearance
          </button>
        </div>
        <div className="settings-tab-content">
          {settingsTab === "provider" ? (
            <ProviderConnections />
          ) : settingsTab === "prompts" ? (
            <PresetEditor
              playthroughId={playthroughId}
              playthroughPromptSettings={playthroughPromptSettings}
              onPlaythroughPromptSettings={onPlaythroughPromptSettings}
            />
          ) : settingsTab === "tags" ? (
            <TagTaxonomyPanel />
          ) : settingsTab === "appearance" ? (
            <AppearanceSettingsPanel />
          ) : (
            <div className="chat-settings-group">
            <p className="chat-settings-intro">
              Customize which components and visual indicators appear in the Chat panel.
            </p>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="MessageSquare" size={16} className="text-blue-400" />
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
                  <Icon name="BarChart2" size={16} className="text-emerald-400" />
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
                  <Icon name="Wrench" size={16} className="text-amber-400" />
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

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="Clock" size={16} className="text-indigo-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Display Response Generation Time</span>
                  <span className="chat-setting-desc">Show generation duration badge on AI responses</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showGenerationTime}
                  onChange={(e) => setShowGenerationTime?.(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="Calendar" size={16} className="text-cyan-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Display Chat Message Timestamps</span>
                  <span className="chat-setting-desc">Show timestamps on chat messages</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showMessageTimestamps}
                  onChange={(e) => setShowMessageTimestamps?.(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>

            <label className="chat-setting-card">
              <div className="chat-setting-main">
                <div className="chat-setting-icon" aria-hidden="true">
                  <Icon name="Bot" size={16} className="text-purple-400" />
                </div>
                <div className="chat-setting-info">
                  <span className="chat-setting-title">Display AI Model Name</span>
                  <span className="chat-setting-desc">Show model name and provider icon badge on AI responses</span>
                </div>
              </div>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={showModelName}
                  onChange={(e) => setShowModelName?.(e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </label>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
