import { useCallback, useEffect, useId, useState } from "react";
import type { AutoScrollBehavior, ProviderKind } from "../../../schemas";
import {
  UI_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveUiPreferences,
  updateViewPreferences,
} from "../../api";
import { isTopDialog, popDialog, pushDialog } from "../../engine/dialogStack";
import { PresetEditor } from "./PresetEditor";
import { ProviderConnections } from "./ProviderConnections";
import { ProviderOverridesPanel } from "./providers/ProviderOverridesPanel";
import { TagTaxonomyPanel } from "../library/TagTaxonomyModal";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { InterfaceSettingsPanel } from "./InterfaceSettingsPanel";
import { ChatSettingsPanel } from "./ChatSettingsPanel";
import { ConfirmModal } from "../common/ConfirmModal";
import { Button, Header, Stack, Tabs, type TabItem } from "../base";

type SettingsTab = "provider" | "prompts" | "tags" | "chat" | "interface" | "appearance";

const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { id: "provider", label: "Providers", icon: "Cpu" },
  { id: "prompts", label: "Prompts", icon: "Sliders" },
  { id: "tags", label: "Tags & Taxonomy", icon: "Tag" },
  { id: "chat", label: "Chat", icon: "MessageSquare" },
  { id: "interface", label: "Interface", icon: "Layout" },
  { id: "appearance", label: "Appearance", icon: "Palette" },
];

type ProviderSubTab = ProviderKind | "overrides";

/** The Provider tab's own tabs: text and image connections are configured
 *  independently, and workflow overrides live in the third sub-tab. */
const PROVIDER_KIND_TABS: TabItem<ProviderSubTab>[] = [
  { id: "text", label: "Text Providers", icon: "MessageSquare" },
  { id: "image", label: "Image Providers", icon: "Image" },
  { id: "overrides", label: "Provider Overrides", icon: "Sliders" },
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
  showMessageNumbers?: boolean;
  setShowMessageNumbers?: (show: boolean) => void;
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
  autoScrollBehavior?: AutoScrollBehavior;
  setAutoScrollBehavior?: (behavior: AutoScrollBehavior) => void;
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
    showMessageNumbers = true,
    setShowMessageNumbers,
    imagePromptPreview = true,
    autoImageAfterTurn = false,
    setAutoImageAfterTurn,
    alwaysDiscardOldImage = false,
    setAlwaysDiscardOldImage,
    setImagePromptPreview,
    autoScrollBehavior = "start",
    setAutoScrollBehavior,
  } = props;

  const dialogId = useId();
  const titleId = useId();

  const [settingsTab, setSettingsTabState] = useState<SettingsTab>(
    UI_PREFERENCE_DEFAULTS.settingsTab
  );
  const [providerKind, setProviderKindState] = useState<ProviderSubTab>(
    UI_PREFERENCE_DEFAULTS.settingsProviderKind
  );

  /** The reader picked a tab: state first so the click feels instant, then the one leaf that changed. */
  const setSettingsTab = (tab: SettingsTab) => {
    setSettingsTabState(tab);
    void updateViewPreferences({ ui: { settingsTab: tab } }).catch(() => {
      /* The next read reconciles; a failed write must not break the tabs. */
    });
  };

  const setProviderKind = (kind: ProviderSubTab) => {
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
  const [visitedKinds, setVisitedKinds] = useState<Set<ProviderSubTab>>(
    () => new Set<ProviderSubTab>([UI_PREFERENCE_DEFAULTS.settingsProviderKind])
  );

  /** Reported up from ProviderConnections, which owns the form. Keyed by kind
   *  because both provider instances are mounted at once. */
  const [dirtyKinds, setDirtyKinds] = useState<Record<ProviderKind, boolean>>({
    text: false,
    image: false,
  });
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

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  // Register on the dialog stack while open so Escape & backdrop clicks dismiss Settings only when
  // no nested dialog (e.g. ConfirmModal) sits on top of it.
  useEffect(() => {
    if (!open) return;
    pushDialog(dialogId);
    return () => popDialog(dialogId);
  }, [open, dialogId]);

  useEffect(() => {
    if (!open || confirmClose) return;
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!isTopDialog(dialogId)) return;
      event.preventDefault();
      requestClose();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [open, confirmClose, dialogId, requestClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop settings-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirmClose && isTopDialog(dialogId)) {
          requestClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal settings-modal-wide"
      >
        <Header
          variant="modal"
          title="Settings"
          titleId={titleId}
          bordered
          actions={
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leftIcon="X"
              tooltip="Close"
              tooltipSide="bottom"
              onClick={requestClose}
              aria-label="Close Settings"
            />
          }
        />

        <div className="settings-modal-body">
          <Tabs<SettingsTab>
            tabs={SETTINGS_TABS}
            activeTab={settingsTab}
            onChange={setSettingsTab}
            variant="sidebar"
            size="sm"
            ariaLabel="Settings categories"
          />

          <div className="settings-tab-content">
            <div hidden={settingsTab !== "provider"}>
              {visitedTabs.has("provider") && (
                <Stack direction="column" align="stretch" gap="xs">
                  <Tabs<ProviderSubTab>
                    tabs={PROVIDER_KIND_TABS}
                    activeTab={providerKind}
                    onChange={setProviderKind}
                    variant="segmented"
                    size="sm"
                    fullWidth
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
                  <div hidden={providerKind !== "overrides"}>
                    {visitedKinds.has("overrides") && (
                      <ProviderOverridesPanel active={providerKind === "overrides"} />
                    )}
                  </div>
                </Stack>
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
                <ChatSettingsPanel
                  choicesEnabled={choicesEnabled}
                  setChoicesEnabled={setChoicesEnabled}
                  showDebug={showDebug}
                  setShowDebug={setShowDebug}
                  showContextUsage={showContextUsage}
                  setShowContextUsage={setShowContextUsage}
                  showGenerationTime={showGenerationTime}
                  setShowGenerationTime={setShowGenerationTime}
                  showMessageTimestamps={showMessageTimestamps}
                  setShowMessageTimestamps={setShowMessageTimestamps}
                  showModelName={showModelName}
                  setShowModelName={setShowModelName}
                  showMessageNumbers={showMessageNumbers}
                  setShowMessageNumbers={setShowMessageNumbers}
                  imagePromptPreview={imagePromptPreview}
                  setImagePromptPreview={setImagePromptPreview}
                  autoImageAfterTurn={autoImageAfterTurn}
                  setAutoImageAfterTurn={setAutoImageAfterTurn}
                  alwaysDiscardOldImage={alwaysDiscardOldImage}
                  setAlwaysDiscardOldImage={setAlwaysDiscardOldImage}
                  autoScrollBehavior={autoScrollBehavior}
                  setAutoScrollBehavior={setAutoScrollBehavior}
                />
              )}
            </div>

            <div hidden={settingsTab !== "interface"}>
              {visitedTabs.has("interface") && <InterfaceSettingsPanel />}
            </div>

            <div hidden={settingsTab !== "appearance"}>
              {visitedTabs.has("appearance") && <AppearanceSettingsPanel />}
            </div>
          </div>
        </div>

        {/* The only way to leave a dirty draft. ConfirmModal renders its own
            backdrop and sits on top of the dialog stack, so Escape or backdrop
            dismissal cannot close the Settings modal underneath it. */}
        {confirmClose && (
          <ConfirmModal
            title="Discard unsaved changes?"
            message="Your edits to this provider connection have not been saved."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            danger
            onConfirm={() => {
              setConfirmClose(false);
              onClose();
            }}
            onCancel={() => setConfirmClose(false)}
          />
        )}
      </section>
    </div>
  );
}
