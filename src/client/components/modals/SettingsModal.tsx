import { useCallback, useEffect, useState } from "react";
import type { ProviderKind } from "../../../schemas";
import {
  UI_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveUiPreferences,
  updateViewPreferences
} from "../../api";
import { PresetEditor } from "./PresetEditor";
import { ProviderConnections } from "./ProviderConnections";
import { TagTaxonomyPanel } from "../library/TagTaxonomyModal";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { ConfirmModal } from "../common/ConfirmModal";
import { Icon, SwitchRow, Tabs, type TabItem } from "../base";

type SettingsTab = "provider" | "prompts" | "tags" | "chat" | "appearance";

const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { id: "provider", label: "Provider", icon: "Cpu" },
  { id: "prompts", label: "Prompt Configuration", icon: "Sliders" },
  { id: "tags", label: "Tags & Taxonomy", icon: "Tag" },
  { id: "chat", label: "Chat", icon: "MessageSquare" },
  { id: "appearance", label: "Interface & Appearance", icon: "Palette" },
];

/** The Provider tab's own tabs: text and image connections are configured
 *  independently and never share a list. */
const PROVIDER_KIND_TABS: TabItem<ProviderKind>[] = [
  { id: "text", label: "Text Providers", icon: "MessageSquare" },
  { id: "image", label: "Image Providers", icon: "Image" },
];

/** The tab choice and the provider kind are view preferences like any other: they live on the single
 *  server copy so the choice survives the modal unmounting when the view leaves Home, and follows the
 *  reader to their next device. The declarations below read them AFTER first paint, so until that read
 *  lands the defaults stand in. */

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
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
  /** Review the text model's image prompt before it is sent to the image
   *  provider. Optional (default on) so the modal can be rendered without a
   *  chat-settings source. */
  imagePromptPreview?: boolean;
  /** Generate an image for every completed turn, without pressing the button. */
  autoImageAfterTurn?: boolean;
  setAutoImageAfterTurn?: (auto: boolean) => void;
  /** Skip the confirmation when an image's request body is re-sent. Ticked from
   *  that confirmation's own checkbox as well, which is why the switch has to
   *  live somewhere the user can find it again. */
  alwaysDiscardOldImage?: boolean;
  setAlwaysDiscardOldImage?: (always: boolean) => void;
  setImagePromptPreview?: (show: boolean) => void;
};

export function SettingsModal(props: SettingsModalProps) {
  const {
    open,
    onClose,
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
    imagePromptPreview = true,
    autoImageAfterTurn = false,
    setAutoImageAfterTurn,
    alwaysDiscardOldImage = false,
    setAlwaysDiscardOldImage,
    setImagePromptPreview,
  } = props;
  const [settingsTab, setSettingsTabState] = useState<SettingsTab>(UI_PREFERENCE_DEFAULTS.settingsTab);
  const [providerKind, setProviderKindState] = useState<ProviderKind>(
    UI_PREFERENCE_DEFAULTS.settingsProviderKind
  );
  /** The reader picked a tab: state first so the click feels instant, then the one leaf that changed. */
  const setSettingsTab = (tab: SettingsTab) => {
    setSettingsTabState(tab);
    void updateViewPreferences({ ui: { settingsTab: tab } }).catch(() => {
      /* The next read reconciles; a failed write must not break the tabs. */
    });
  };

  const setProviderKind = (kind: ProviderKind) => {
    setProviderKindState(kind);
    void updateViewPreferences({ ui: { settingsProviderKind: kind } }).catch(() => {
      /* The next read reconciles; a failed write must not break the tabs. */
    });
  };

  /**
   * Panels are mounted on FIRST VISIT and then KEPT mounted — hidden rather than
   * unmounted — so switching tabs can no longer throw away an in-progress
   * provider draft. Lazily mounting on first visit preserves the previous
   * behaviour of not fetching a panel the user never opened.
   *
   * Seeded from the default so the initial paint has content to show; the read
   * below adds the stored tab, which the effects further down then visit.
   */
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTab>>(
    () => new Set<SettingsTab>([UI_PREFERENCE_DEFAULTS.settingsTab])
  );
  const [visitedKinds, setVisitedKinds] = useState<Set<ProviderKind>>(
    () => new Set<ProviderKind>([UI_PREFERENCE_DEFAULTS.settingsProviderKind])
  );

  /** Reported up from ProviderConnections, which owns the form. Keyed by kind
   *  because both provider instances are mounted at once. */
  const [dirtyKinds, setDirtyKinds] = useState<Record<ProviderKind, boolean>>({ text: false, image: false });
  const [confirmClose, setConfirmClose] = useState(false);

  const dirty = dirtyKinds.text || dirtyKinds.image;

  // Both leaves come from the server (adopting whatever this device still held first), so they arrive
  // after first paint — which is what keeps the swap invisible.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      const resolved = resolveUiPreferences(preferences);
      setSettingsTabState(resolved.settingsTab);
      setProviderKindState(resolved.settingsProviderKind);
    })().catch(() => {
      /* A failed read leaves the defaults on screen; nothing is written, so nothing is lost. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(settingsTab) ? prev : new Set(prev).add(settingsTab)));
  }, [settingsTab]);
  useEffect(() => {
    setVisitedKinds((prev) => (prev.has(providerKind) ? prev : new Set(prev).add(providerKind)));
  }, [providerKind]);

  // Stable identity: ProviderConnections calls this from an effect, so a new
  // function every render would re-run that effect on every render.
  const handleDirtyChange = useCallback((kind: ProviderKind, isDirty: boolean) => {
    setDirtyKinds((prev) => (prev[kind] === isDirty ? prev : { ...prev, [kind]: isDirty }));
  }, []);

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal-wide">
        <header className="modal-header">
          <div>
            <h2>Settings</h2>
          </div>
          <button className="flex items-center gap-1 modal-close-btn" onClick={requestClose} aria-label="Close Settings"><Icon name="X" size={14} /> Close</button>
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
          <div hidden={settingsTab !== "provider"}>
            {visitedTabs.has("provider") && (
              <div className="settings-subtabs">
                <Tabs<ProviderKind>
                  tabs={PROVIDER_KIND_TABS}
                  activeTab={providerKind}
                  onChange={setProviderKind}
                  variant="pill"
                  size="sm"
                  fullWidth
                  className="settings-provider-tabs"
                  ariaLabel="Provider kind"
                />
                {/* Two instances, each pinned to ONE kind. This replaces the old
                    `key={providerKind}` remount that discarded a half-filled
                    draft on every kind switch: each editor here only ever holds
                    its own kind's fields, so the problem that remount guarded
                    against (a text draft rendered into the image form) cannot
                    arise. */}
                <div hidden={providerKind !== "text"}>
                  {visitedKinds.has("text") && (
                    <ProviderConnections
                      kind="text"
                      active={providerKind === "text"}
                      onDirtyChange={handleDirtyChange}
                    />
                  )}
                </div>
                <div hidden={providerKind !== "image"}>
                  {visitedKinds.has("image") && (
                    <ProviderConnections
                      kind="image"
                      active={providerKind === "image"}
                      onDirtyChange={handleDirtyChange}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div hidden={settingsTab !== "prompts"}>
            {visitedTabs.has("prompts") && <PresetEditor />}
          </div>

          <div hidden={settingsTab !== "tags"}>
            {visitedTabs.has("tags") && <TagTaxonomyPanel />}
          </div>

          <div hidden={settingsTab !== "chat"}>
            {visitedTabs.has("chat") && (
              <div className="chat-settings-group">
                <p className="chat-settings-intro">
                  Customize which components and visual indicators appear in the Chat panel.
                </p>

                <h4 className="chat-settings-section-title">Chat Message</h4>
                <div className="chat-settings-section">
                  <SwitchRow
                    icon="MessageSquare"
                    title="Show Choices"
                    description="Display suggested action choice buttons below turn responses"
                    checked={choicesEnabled}
                    onChange={(e) => setChoicesEnabled(e.target.checked)}
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

                  <SwitchRow
                    icon="BarChart2"
                    title="Show Context Usage"
                    description="Display the Context Meter token and memory usage indicator"
                    checked={showContextUsage}
                    onChange={(e) => setShowContextUsage(e.target.checked)}
                  />
                </div>

                <h4 className="chat-settings-section-title">Image Generation</h4>
                <div className="chat-settings-section">
                  <SwitchRow
                    icon="Image"
                    title="Review Image Prompt Before Generating"
                    description="Show the prompt the text model wrote before it is sent to the image provider. Off sends it straight through."
                    checked={imagePromptPreview}
                    onChange={(e) => setImagePromptPreview?.(e.target.checked)}
                  />

                  <SwitchRow
                    icon="Sparkles"
                    title="Generate Image right after AI Response"
                    description="Write and render an image for every completed turn. Costs one text call plus a render per turn — a local render takes minutes. With review on, the prompt modal still appears first."
                    checked={autoImageAfterTurn}
                    onChange={(e) => setAutoImageAfterTurn?.(e.target.checked)}
                  />

                  <SwitchRow
                    icon="RefreshCw"
                    title="Always Discard Old Image on Re-send"
                    description="Skip the confirmation when an image's request body is sent again. The new render replaces the image it came from either way; with this off, that replacement is confirmed first."
                    checked={alwaysDiscardOldImage}
                    onChange={(e) => setAlwaysDiscardOldImage?.(e.target.checked)}
                  />
                </div>

                <h4 className="chat-settings-section-title">Debugging</h4>
                <div className="chat-settings-section">
                  <SwitchRow
                    icon="Wrench"
                    title="Show Debug Accordion"
                    description="Display the expandable raw prompt, response, and patch inspector"
                    checked={showDebug}
                    onChange={(e) => setShowDebug(e.target.checked)}
                  />
                </div>
              </div>
            )}
          </div>

          <div hidden={settingsTab !== "appearance"}>
            {visitedTabs.has("appearance") && <AppearanceSettingsPanel />}
          </div>
        </div>

        {/* The only way to leave a dirty draft. ConfirmModal renders its own
            backdrop and this modal has no Escape handler, so the confirm cannot
            close the Settings modal underneath it. */}
        {confirmClose && (
          <ConfirmModal
            title="Discard unsaved changes?"
            message="Your edits to this provider connection have not been saved."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            danger
            onConfirm={() => { setConfirmClose(false); onClose(); }}
            onCancel={() => setConfirmClose(false)}
          />
        )}
      </section>
    </div>
  );
}
