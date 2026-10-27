import { useEffect, useState } from "react";
import type { ExportFormat } from "../../../schemas";
import {
  STORAGE_PREFERENCE_DEFAULTS,
  getViewPreferences,
  resolveStoragePreferences,
  updateViewPreferences,
} from "../../api";
import {
  Badge,
  Card,
  FormGrid,
  Header,
  Icon,
  Stack,
  SwitchRow,
  Text,
} from "../base";

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

export function FilesStorageSettingsPanel() {
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    STORAGE_PREFERENCE_DEFAULTS.exportFormat,
  );
  const [alwaysAskExportFormat, setAlwaysAskExportFormat] = useState<boolean>(
    STORAGE_PREFERENCE_DEFAULTS.alwaysAskExportFormat,
  );

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
  }, []);

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

  return (
    <Stack direction="column" align="stretch" gap="md">
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
    </Stack>
  );
}

export default FilesStorageSettingsPanel;
