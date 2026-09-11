import { useEffect, useState } from "react";
import type { PlaythroughPromptSettings } from "../../api";
import type { ProviderKind } from "../../../schemas";
import { PresetEditor } from "./PresetEditor";
import { ProviderConnections } from "./ProviderConnections";
import { TagTaxonomyPanel } from "../library/TagTaxonomyModal";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { Icon, SwitchRow, Tabs, type TabItem } from "../base";

type SettingsTab = "provider" | "prompts" | "tags" | "chat" | "appearance";

const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { id: "provider", label: "Provider", icon: "Cpu" },
  { id: "prompts", label: "Prompt Configuration", icon: "Sliders" },
  { id: "tags", label: "Tags & Taxonomy", icon: "Tag" },
  { id: "chat", label: "Chat", icon: "MessageSquare" },
  { id: "appearance", label: "Theme & Appearance", icon: "Palette" },
];

/** The Provider tab's own tabs: text and image connections are configured
 *  independently and never share a list. */
const PROVIDER_KIND_TABS: TabItem<ProviderKind>[] = [
  { id: "text", label: "Text Providers", icon: "MessageSquare" },
  { id: "image", label: "Image Providers", icon: "Image" },
];

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
  const [providerKind, setProviderKind] = useState<ProviderKind>("text");

  // The modal keeps its state while closed (`if (!open) return null` below), so
  // the Provider tab is reset to the usual Text list on every open.
  useEffect(() => {
    if (open) setProviderKind("text");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal-wide">
        <header className="modal-header">
          <div>
            <h2>Settings</h2>
          </div>
          <button className="flex items-center gap-1 modal-close-btn" onClick={onClose} aria-label="Close Settings"><Icon name="X" size={14} /> Close</button>
        </header>
        <div className="settings-tabs-wrapper">
          <Tabs<SettingsTab>
            tabs={SETTINGS_TABS}
            activeTab={settingsTab}
            onChange={setSettingsTab}
            variant="underline"
            size="sm"
            className="settings-modal-tabs"
          />
        </div>
        <div className="settings-tab-content">
          {settingsTab === "provider" ? (
            <div className="settings-subtabs">
              <Tabs<ProviderKind>
                tabs={PROVIDER_KIND_TABS}
                activeTab={providerKind}
                onChange={setProviderKind}
                variant="pill"
                size="sm"
                className="settings-provider-tabs"
                ariaLabel="Provider kind"
              />
              {/* key: switching kind remounts the list so the per-kind sort
                  preference and the editor state start clean. */}
              <ProviderConnections key={providerKind} kind={providerKind} />
            </div>
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

            <SwitchRow
              icon="MessageSquare"
              title="Show Choices"
              description="Display suggested action choice buttons below turn responses"
              checked={choicesEnabled}
              onChange={(e) => setChoicesEnabled(e.target.checked)}
            />

            <SwitchRow
              icon="BarChart2"
              title="Show Context Usage"
              description="Display the Context Meter token and memory usage indicator"
              checked={showContextUsage}
              onChange={(e) => setShowContextUsage(e.target.checked)}
            />

            <SwitchRow
              icon="Wrench"
              title="Show Debug Accordion"
              description="Display the expandable raw prompt, response, and patch inspector"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />

            <SwitchRow
              icon="Clock"
              title="Display Response Generation Time"
              description="Show generation duration badge on AI responses"
              checked={showGenerationTime}
              onChange={(e) => setShowGenerationTime?.(e.target.checked)}
            />

            <SwitchRow
              iconNode={<Icon name="Calendar" size={15} className="ds-icon-accent" />}
              title="Display Chat Message Timestamps"
              description="Show timestamps on chat messages"
              checked={showMessageTimestamps}
              onChange={(e) => setShowMessageTimestamps?.(e.target.checked)}
            />

            <SwitchRow
              iconNode={<Icon name="Bot" size={15} className="ds-icon-accent" />}
              title="Display AI Model Name"
              description="Show model name and provider icon badge on AI responses"
              checked={showModelName}
              onChange={(e) => setShowModelName?.(e.target.checked)}
            />
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
