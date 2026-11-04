import { useCallback, useEffect, useState } from "react";
import type { ExportFormat } from "../../../schemas";
import {
  STORAGE_PREFERENCE_DEFAULTS,
  cleanupStorageBackups,
  formatStorageBytes,
  getStorageBreakdown,
  getViewPreferences,
  resolveStoragePreferences,
  sweepOrphanImages,
  updateViewPreferences,
  type StorageBreakdown,
} from "../../api";
import { ConfirmModal } from "../common";
import {
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  Separator,
  Stack,
  SwitchRow,
  Tabs,
  Text,
  type TabItem,
} from "../base";

type LargestTab = "playthroughs" | "characters";

const EXPORT_FORMAT_OPTIONS: Array<{
  id: ExportFormat;
  title: string;
  extension: string;
  icon: string;
  hint: string;
  desc: string;
}> = [
  {
    id: "webp",
    title: "WebP Image Card",
    extension: ".webp",
    icon: "FileImage",
    hint: "Compact Image + Embedded Data",
    desc: "Smallest file size; embeds full card data and 1:1 profile crop directly inside the .webp portrait image (Default).",
  },
  {
    id: "png",
    title: "PNG Image Card",
    extension: ".png",
    icon: "Image",
    hint: "Universal Image + tEXt Chunk",
    desc: "Traditional character-card style; converts the portrait to PNG and embeds card metadata in a standard tEXt chunk.",
  },
  {
    id: "json",
    title: "JSON Document",
    extension: ".json",
    icon: "FileJson",
    hint: "Structured Text + Base64 Images",
    desc: "Pure JSON file with embedded base64 portrait and profile images; readable in any text editor and works without a portrait.",
  },
];

export type FilesStorageSettingsPanelProps = {
  /** Optional preloaded storage breakdown (used by deterministic unit tests). */
  initialStorage?: StorageBreakdown | null;
  /** Optional initial active tab for Largest Items inspector. */
  initialLargestTab?: LargestTab;
};

export function FilesStorageSettingsPanel({
  initialStorage = null,
  initialLargestTab = "playthroughs",
}: FilesStorageSettingsPanelProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    STORAGE_PREFERENCE_DEFAULTS.exportFormat,
  );
  const [alwaysAskExportFormat, setAlwaysAskExportFormat] = useState<boolean>(
    STORAGE_PREFERENCE_DEFAULTS.alwaysAskExportFormat,
  );

  const [storage, setStorage] = useState<StorageBreakdown | null>(
    initialStorage,
  );
  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(
    initialStorage === null,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [largestTab, setLargestTab] = useState<LargestTab>(initialLargestTab);

  const [isSweepingOrphans, setIsSweepingOrphans] = useState(false);
  const [isCleaningBackups, setIsCleaningBackups] = useState(false);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [maintenanceNotice, setMaintenanceNotice] = useState<string | null>(
    null,
  );

  const refreshStorage = useCallback(async () => {
    setIsLoadingStorage(true);
    setStorageError(null);
    try {
      const data = await getStorageBreakdown();
      setStorage(data);
    } catch (err) {
      setStorageError(
        err instanceof Error
          ? err.message
          : "Failed to load storage breakdown.",
      );
    } finally {
      setIsLoadingStorage(false);
    }
  }, []);

  useEffect(() => {
    getViewPreferences()
      .then((prefs) => {
        const resolved = resolveStoragePreferences(prefs);
        setExportFormat(resolved.exportFormat);
        setAlwaysAskExportFormat(resolved.alwaysAskExportFormat);
      })
      .catch(() => {
        /* fallback to state defaults */
      });
    void refreshStorage();
  }, [refreshStorage]);

  function handleSelectExportFormat(format: ExportFormat) {
    setExportFormat(format);
    void updateViewPreferences({
      storage: { exportFormat: format },
    }).catch(() => {});
  }

  function handleToggleAlwaysAsk(next: boolean) {
    setAlwaysAskExportFormat(next);
    void updateViewPreferences({
      storage: { alwaysAskExportFormat: next },
    }).catch(() => {});
  }

  async function handleSweepOrphans() {
    setIsSweepingOrphans(true);
    setMaintenanceNotice(null);
    setStorageError(null);
    try {
      const result = await sweepOrphanImages();
      setMaintenanceNotice(
        result.removed > 0
          ? `Removed ${result.removed} orphaned image${result.removed === 1 ? "" : "s"} (${formatStorageBytes(result.freedBytes)} freed).`
          : "No orphaned images found to remove.",
      );
      await refreshStorage();
    } catch (err) {
      setStorageError(
        err instanceof Error ? err.message : "Failed to sweep orphaned images.",
      );
    } finally {
      setIsSweepingOrphans(false);
    }
  }

  async function handleConfirmCleanupBackups() {
    setIsCleaningBackups(true);
    setMaintenanceNotice(null);
    setStorageError(null);
    try {
      const result = await cleanupStorageBackups();
      setConfirmCleanupOpen(false);
      setMaintenanceNotice(
        result.removed > 0
          ? `Cleaned up ${result.removed} backup item${result.removed === 1 ? "" : "s"} (${formatStorageBytes(result.freedBytes)} freed).`
          : "No .bak backup files found to clean up.",
      );
      await refreshStorage();
    } catch (err) {
      setStorageError(
        err instanceof Error ? err.message : "Failed to clean up backup files.",
      );
    } finally {
      setIsCleaningBackups(false);
    }
  }

  const categories = storage?.categories;
  const mediaBytes = categories?.playthroughsImages.bytes ?? 0;
  const ptJsonBytes = categories?.playthroughsJson.bytes ?? 0;
  const charBytes = categories?.characters.bytes ?? 0;
  const worldBytes =
    (categories?.personas.bytes ?? 0) + (categories?.lorebooks.bytes ?? 0);
  const settingsBytes = categories?.settingsAndPresets.bytes ?? 0;
  const orphanBytes = categories?.orphanImages.bytes ?? 0;
  const backupBytes = categories?.backups.bytes ?? 0;
  const reclaimableBytes = orphanBytes + backupBytes;
  const totalBytes = storage?.totalBytes ?? 0;

  const segments = [
    {
      key: "media",
      label: "Playthrough Media",
      bytes: mediaBytes,
      className: "base-storage-bar__segment--media",
      dotClass: "base-storage-dot--media",
      countLabel: `${categories?.playthroughsImages.count ?? 0} unique images`,
      desc: "Deduplicated scene & portrait images across playthroughs.",
    },
    {
      key: "playthroughs",
      label: "Playthrough JSON",
      bytes: ptJsonBytes,
      className: "base-storage-bar__segment--playthroughs",
      dotClass: "base-storage-dot--playthroughs",
      countLabel: `${categories?.playthroughsJson.count ?? 0} timelines`,
      desc: "Messages, turn snapshots, memory layers, and world state.",
    },
    {
      key: "characters",
      label: "Character Library",
      bytes: charBytes,
      className: "base-storage-bar__segment--characters",
      dotClass: "base-storage-dot--characters",
      countLabel: `${categories?.characters.count ?? 0} characters`,
      desc: "Character templates, version history, and card portraits.",
    },
    {
      key: "world",
      label: "Personas & Lorebooks",
      bytes: worldBytes,
      className: "base-storage-bar__segment--world",
      dotClass: "base-storage-dot--world",
      countLabel: `${categories?.personas.count ?? 0} personas · ${categories?.lorebooks.count ?? 0} lorebooks`,
      desc: "Player personas, custom avatars, and world info entries.",
    },
    {
      key: "settings",
      label: "Settings & Presets",
      bytes: settingsBytes,
      className: "base-storage-bar__segment--settings",
      dotClass: "base-storage-dot--settings",
      countLabel: `${categories?.settingsAndPresets.count ?? 0} config files`,
      desc: "Provider connections, prompt presets, and user preferences.",
    },
    {
      key: "reclaimable",
      label: "Reclaimable Space",
      bytes: reclaimableBytes,
      className: "base-storage-bar__segment--reclaimable",
      dotClass: "base-storage-dot--reclaimable",
      countLabel: `${(categories?.orphanImages.count ?? 0) + (categories?.backups.count ?? 0)} items`,
      desc: "Unreferenced hash images and .bak quarantine/backup files.",
    },
  ];

  const largestTabs: TabItem<LargestTab>[] = [
    {
      id: "playthroughs",
      label: "Playthroughs",
      icon: "BookOpen",
      badge: (
        <Badge variant="neutral" size="xs">
          {storage?.largestPlaythroughs.length ?? 0}
        </Badge>
      ),
    },
    {
      id: "characters",
      label: "Characters",
      icon: "Users",
      badge: (
        <Badge variant="neutral" size="xs">
          {storage?.largestCharacters.length ?? 0}
        </Badge>
      ),
    },
  ];

  return (
    <Stack direction="column" align="stretch" gap="md">
      {/* 1. Storage Overview */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Database"
          title="Storage Overview"
          badge={
            <Badge variant="accent" size="xs">
              {storage ? formatStorageBytes(totalBytes) : "Loading…"}
            </Badge>
          }
          subtitle="Physical disk space used inside your local data/ directory. Hardlinked images shared across timeline branches are counted once."
          actions={
            <Button
              variant="secondary"
              size="xs"
              leftIcon="RefreshCw"
              onClick={() => void refreshStorage()}
              isLoading={isLoadingStorage}
              title="Rescan local data directory"
            >
              Refresh
            </Button>
          }
        />

        {storageError && (
          <Card variant="panel" padding="xs">
            <Stack direction="row" align="center" gap="xs">
              <Icon name="AlertTriangle" size={15} />
              <Text as="span" variant="caption" tone="danger">
                {storageError}
              </Text>
            </Stack>
          </Card>
        )}

        {storage && (
          <>
            <Card variant="panel" padding="sm">
              <Stack direction="column" align="stretch" gap="xs">
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                  wrap
                >
                  <Text as="span" size="xs" weight="semibold" tone="primary">
                    Local Data Distribution
                  </Text>
                  <Text as="span" variant="caption" tone="secondary">
                    {formatStorageBytes(totalBytes)} total across{" "}
                    {categories?.playthroughsJson.count ?? 0} playthroughs &amp;{" "}
                    {categories?.characters.count ?? 0} characters
                  </Text>
                </Stack>

                <div
                  className="base-storage-bar"
                  role="img"
                  aria-label={`Storage usage bar: ${formatStorageBytes(totalBytes)} total`}
                >
                  {segments
                    .filter((seg) => seg.bytes > 0)
                    .map((seg) => {
                      const pct =
                        totalBytes > 0
                          ? Math.max(1, (seg.bytes / totalBytes) * 100)
                          : 0;
                      return (
                        <div
                          key={seg.key}
                          className={`base-storage-bar__segment ${seg.className}`}
                          style={{ flexGrow: pct }}
                          title={`${seg.label}: ${formatStorageBytes(seg.bytes)}`}
                        />
                      );
                    })}
                </div>
              </Stack>
            </Card>

            <FormGrid cols={3} gap="xs">
              {segments.map((seg) => (
                <Card key={seg.key} variant="elevated" padding="sm">
                  <Stack direction="column" align="stretch" gap="2xs">
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <span
                          className={`base-storage-dot ${seg.dotClass}`}
                          aria-hidden="true"
                        />
                        <Text
                          as="strong"
                          size="xs"
                          weight="semibold"
                          tone="primary"
                        >
                          {seg.label}
                        </Text>
                      </Stack>
                      <Badge
                        variant={
                          seg.key === "reclaimable" && seg.bytes > 0
                            ? "warning"
                            : "neutral"
                        }
                        size="xs"
                      >
                        {formatStorageBytes(seg.bytes)}
                      </Badge>
                    </Stack>

                    <Text as="span" variant="caption" tone="muted">
                      {seg.countLabel}
                    </Text>
                    <Text as="p" variant="caption" tone="secondary">
                      {seg.desc}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </FormGrid>
          </>
        )}
      </Stack>

      <Separator />

      {/* 2. Storage Maintenance */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Wrench"
          title="Storage Maintenance"
          badge={
            <Badge
              variant={reclaimableBytes > 0 ? "warning" : "neutral"}
              size="xs"
            >
              {reclaimableBytes > 0
                ? `${formatStorageBytes(reclaimableBytes)} Reclaimable`
                : "Clean"}
            </Badge>
          }
          subtitle="Reclaim disk space by sweeping unreferenced playthrough images or removing quarantined .bak backup files."
        />

        {maintenanceNotice && (
          <Card variant="panel" padding="xs">
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
            >
              <Stack direction="row" align="center" gap="xs">
                <Icon name="Check" size={15} />
                <Text as="span" variant="caption" tone="primary">
                  {maintenanceNotice}
                </Text>
              </Stack>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setMaintenanceNotice(null)}
              >
                Dismiss
              </Button>
            </Stack>
          </Card>
        )}

        <FormGrid cols={2} gap="xs">
          <Card variant="elevated" padding="sm">
            <Stack
              direction="column"
              align="stretch"
              justify="between"
              gap="xs"
            >
              <Stack direction="column" align="stretch" gap="2xs">
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="Image" size={16} />
                    <Text
                      as="strong"
                      size="xs"
                      weight="semibold"
                      tone="primary"
                    >
                      Sweep Orphaned Images
                    </Text>
                  </Stack>
                  <Badge
                    variant={orphanBytes > 0 ? "warning" : "neutral"}
                    size="xs"
                  >
                    {categories?.orphanImages.count ?? 0} files (
                    {formatStorageBytes(orphanBytes)})
                  </Badge>
                </Stack>
                <Text as="p" variant="caption" tone="secondary">
                  Removes content-addressed image files that are no longer
                  referenced by any playthrough message, gallery, cover, or turn
                  snapshot.
                </Text>
              </Stack>

              <Stack direction="row" justify="end">
                <Button
                  variant="secondary"
                  size="xs"
                  leftIcon="Trash2"
                  onClick={() => void handleSweepOrphans()}
                  isLoading={isSweepingOrphans}
                >
                  Sweep Orphans
                </Button>
              </Stack>
            </Stack>
          </Card>

          <Card variant="elevated" padding="sm">
            <Stack
              direction="column"
              align="stretch"
              justify="between"
              gap="xs"
            >
              <Stack direction="column" align="stretch" gap="2xs">
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="xs"
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="Archive" size={16} />
                    <Text
                      as="strong"
                      size="xs"
                      weight="semibold"
                      tone="primary"
                    >
                      Clean Up .bak Backups
                    </Text>
                  </Stack>
                  <Badge
                    variant={backupBytes > 0 ? "warning" : "neutral"}
                    size="xs"
                  >
                    {categories?.backups.count ?? 0} items (
                    {formatStorageBytes(backupBytes)})
                  </Badge>
                </Stack>
                <Text as="p" variant="caption" tone="secondary">
                  Permanently deletes quarantined .bak folders (created when
                  deleting characters or personas) and .bak.&lt;timestamp&gt;
                  backup files.
                </Text>
              </Stack>

              <Stack direction="row" justify="end">
                <Button
                  variant={backupBytes > 0 ? "danger" : "secondary"}
                  size="xs"
                  leftIcon="Trash2"
                  disabled={(categories?.backups.count ?? 0) === 0}
                  onClick={() => setConfirmCleanupOpen(true)}
                  isLoading={isCleaningBackups}
                >
                  Clean Up Backups
                </Button>
              </Stack>
            </Stack>
          </Card>
        </FormGrid>
      </Stack>

      <Separator />

      {/* 3. Largest Items Inspector */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="BarChart2"
          title="Largest Items"
          subtitle="Inspect which playthrough timelines and character cards consume the most local storage."
          actions={
            <Tabs
              tabs={largestTabs}
              activeTab={largestTab}
              onChange={setLargestTab}
              variant="segmented"
              size="sm"
              ariaLabel="Largest storage items category"
            />
          }
        />

        {largestTab === "playthroughs" ? (
          (storage?.largestPlaythroughs.length ?? 0) === 0 ? (
            <Card variant="panel" padding="sm">
              <Text as="p" variant="caption" tone="muted">
                No playthrough records found on disk.
              </Text>
            </Card>
          ) : (
            <Stack direction="column" align="stretch" gap="2xs">
              {storage?.largestPlaythroughs.map((pt, idx) => (
                <Card key={pt.id} variant="panel" padding="xs">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="sm"
                    wrap
                  >
                    <Stack direction="row" align="center" gap="xs" wrap>
                      <Badge variant="neutral" size="xs">
                        #{idx + 1}
                      </Badge>
                      <Text
                        as="strong"
                        size="xs"
                        weight="semibold"
                        tone="primary"
                      >
                        {pt.name}
                      </Text>
                      <Badge variant="neutral" size="xs">
                        Turn {pt.turn}
                      </Badge>
                      {pt.isTimelineBranch && (
                        <Badge variant="accent" size="xs">
                          <Icon name="GitBranch" size={11} />
                          Branch
                        </Badge>
                      )}
                    </Stack>

                    <Stack direction="row" align="center" gap="sm" wrap>
                      <Text as="span" variant="caption" tone="secondary">
                        JSON: {formatStorageBytes(pt.jsonBytes)} · Media:{" "}
                        {formatStorageBytes(pt.imageBytes)} ({pt.imageCount}{" "}
                        {pt.imageCount === 1 ? "image" : "images"})
                      </Text>
                      <Badge variant="accent" size="xs">
                        {formatStorageBytes(pt.totalBytes)}
                      </Badge>
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )
        ) : (storage?.largestCharacters.length ?? 0) === 0 ? (
          <Card variant="panel" padding="sm">
            <Text as="p" variant="caption" tone="muted">
              No character folders found on disk.
            </Text>
          </Card>
        ) : (
          <Stack direction="column" align="stretch" gap="2xs">
            {storage?.largestCharacters.map((ch, idx) => (
              <Card key={ch.id} variant="panel" padding="xs">
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="sm"
                  wrap
                >
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Badge variant="neutral" size="xs">
                      #{idx + 1}
                    </Badge>
                    <Text
                      as="strong"
                      size="xs"
                      weight="semibold"
                      tone="primary"
                    >
                      {ch.name}
                    </Text>
                    <Badge
                      variant={ch.format === "ccv2" ? "warning" : "neutral"}
                      size="xs"
                    >
                      {ch.format === "ccv2" ? "CCv2" : "BL"}
                    </Badge>
                    {ch.versionCount > 1 && (
                      <Badge variant="neutral" size="xs">
                        {ch.versionCount} versions
                      </Badge>
                    )}
                    {ch.hasCcv2Card && ch.format !== "ccv2" && (
                      <Badge variant="neutral" size="xs">
                        Original Card Kept
                      </Badge>
                    )}
                  </Stack>

                  <Stack direction="row" align="center" gap="sm" wrap>
                    <Text as="span" variant="caption" tone="secondary">
                      JSON: {formatStorageBytes(ch.jsonBytes)} · Art:{" "}
                      {formatStorageBytes(ch.imageBytes)}
                    </Text>
                    <Badge variant="accent" size="xs">
                      {formatStorageBytes(ch.totalBytes)}
                    </Badge>
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>

      <Separator />

      {/* 4. Individual Export Format */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="HardDrive"
          title="Individual Export Format"
          badge={
            <Badge variant="neutral" size="xs">
              Personas &amp; Cards
            </Badge>
          }
          subtitle="Choose the default file format when exporting individual items. If an image card format (.webp or .png) is selected and the item has no portrait image, you will be prompted to export it as a .json file instead. Importing automatically accepts all three formats."
        />

        <FormGrid cols={3} gap="xs">
          {EXPORT_FORMAT_OPTIONS.map((opt) => {
            const isSelected = exportFormat === opt.id;
            return (
              <Card
                key={opt.id}
                as="button"
                type="button"
                variant="elevated"
                padding="sm"
                active={isSelected}
                hoverable
                aria-pressed={isSelected}
                onClick={() => handleSelectExportFormat(opt.id)}
              >
                <Stack direction="column" align="stretch" gap="xs">
                  <Card variant="panel" padding="xs">
                    <Stack direction="row" align="center" gap="sm">
                      <Icon name={opt.icon} size={22} />
                      <Stack direction="column" align="start" gap="2xs">
                        <Badge variant="neutral" size="xs">
                          {opt.extension}
                        </Badge>
                        <Text as="span" variant="caption" tone="muted">
                          {opt.hint}
                        </Text>
                      </Stack>
                    </Stack>
                  </Card>

                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                  >
                    <Text
                      as="strong"
                      size="xs"
                      weight="semibold"
                      tone="primary"
                    >
                      {opt.title}
                    </Text>
                    {isSelected && (
                      <Badge variant="accent" size="xs">
                        Active
                      </Badge>
                    )}
                  </Stack>

                  <Text as="p" variant="caption" tone="secondary">
                    {opt.desc}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </FormGrid>

        <SwitchRow
          title="Always ask for Export Format"
          description="Show the export format picker in the Character Export dialog before downloading. Unchecking this (or selecting 'Always Remember Export Format' during export) uses the active format above automatically."
          checked={alwaysAskExportFormat}
          onChange={(e) => handleToggleAlwaysAsk(e.target.checked)}
        />
      </Stack>

      {confirmCleanupOpen && (
        <ConfirmModal
          title="Clean Up .bak Backup Files?"
          message={`This will permanently delete ${categories?.backups.count ?? 0} quarantined/backup item${(categories?.backups.count ?? 0) === 1 ? "" : "s"} (${formatStorageBytes(backupBytes)}) from your local data directory. Active playthroughs, characters, personas, and lorebooks will not be affected.`}
          confirmLabel="Delete Backups"
          danger
          isLoading={isCleaningBackups}
          onConfirm={() => void handleConfirmCleanupBackups()}
          onCancel={() => setConfirmCleanupOpen(false)}
        >
          {(categories?.backups.items.length ?? 0) > 0 && (
            <Card variant="panel" padding="xs">
              <Stack direction="column" align="stretch" gap="2xs">
                {categories?.backups.items.slice(0, 8).map((item, idx) => (
                  <Stack
                    key={`${item.category}-${item.name}-${idx}`}
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                  >
                    <Text as="span" variant="caption" tone="primary">
                      {item.category}/{item.name}
                    </Text>
                    <Badge variant="neutral" size="xs">
                      {formatStorageBytes(item.bytes)}
                    </Badge>
                  </Stack>
                ))}
                {(categories?.backups.items.length ?? 0) > 8 && (
                  <Text as="span" variant="caption" tone="muted">
                    +{(categories?.backups.items.length ?? 0) - 8} more backup
                    items…
                  </Text>
                )}
              </Stack>
            </Card>
          )}
        </ConfirmModal>
      )}
    </Stack>
  );
}

export default FilesStorageSettingsPanel;
