import { useEffect, useRef, useState } from "react";
import {
  WORKSPACE_WIDTH_DEFAULT,
  WORKSPACE_WIDTH_MAX,
  WORKSPACE_WIDTH_MIN,
  type AvatarShape,
  type CoverAspect,
} from "../../../schemas";
import { clampWorkspaceWidthPercent } from "../../../engine/theme";
import {
  applyAvatarShapeTheme,
  applyCoverAspect,
  applyWorkspaceWidth,
  getAppearanceSettings,
  updateAppearanceSettings,
} from "../../api";
import {
  AvatarBadge,
  Badge,
  Card,
  CoverAspectPreview,
  FormGrid,
  Header,
  Separator,
  Slider,
  Stack,
  SwitchRow,
  Text,
} from "../base";

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
  ratio: string;
  frameHint: string;
  desc: string;
}> = [
  {
    id: "landscape",
    title: "Landscape",
    ratio: "16:9",
    frameHint: "Wide banner",
    desc: "16:9 — the widest banner; suits wide renders and keeps a long shelf compact (Default)",
  },
  {
    id: "square",
    title: "1:1 Square",
    ratio: "1:1",
    frameHint: "Uncropped square",
    desc: "Square — the shape most image models return, so nothing is cropped",
  },
  {
    id: "portrait",
    title: "Portrait",
    ratio: "2:3",
    frameHint: "Tall portrait",
    desc: "2:3 — tallest frame; suits character art",
  },
];

export function InterfaceSettingsPanel() {
  // Initial values are the shipped defaults: the server paints these tokens into the first frame and
  // the GET below fills the controls, so the device cache is gone (it desynced across devices).
  const [workspaceWidthPercent, setWorkspaceWidthPercent] = useState<number>(
    WORKSPACE_WIDTH_DEFAULT,
  );
  const [avatarShape, setAvatarShape] = useState<AvatarShape>("rounded");
  const [coverAspect, setCoverAspect] = useState<CoverAspect>("landscape");
  const widthPersistTimerRef = useRef<number | null>(null);

  /** The play view's panel swipe. The panel is the switch's owner; the play view reads the same
   *  setting to decide whether the gesture exists. Nothing is cached locally — see the note on
   *  `AppearanceSettings.paneSwipeEnabled`. */
  const [paneSwipeEnabled, setPaneSwipeEnabled] = useState(true);

  useEffect(() => {
    getAppearanceSettings()
      .then((res) => {
        if (typeof res.workspaceWidthPercent === "number") {
          const clamped = clampWorkspaceWidthPercent(res.workspaceWidthPercent);
          setWorkspaceWidthPercent(clamped);
          applyWorkspaceWidth(clamped);
        }
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
    return () => {
      if (widthPersistTimerRef.current !== null) {
        window.clearTimeout(widthPersistTimerRef.current);
      }
    };
  }, []);

  async function persistInterfaceSettings(updates: {
    workspaceWidthPercent?: number;
    avatarShape?: AvatarShape;
    coverAspect?: CoverAspect;
    paneSwipeEnabled?: boolean;
  }) {
    try {
      await updateAppearanceSettings(updates);
    } catch {
      /* Next read reconciles; local UI state is already applied immediately. */
    }
  }

  function handleWorkspaceWidthChange(value: number | null | undefined) {
    const clamped = clampWorkspaceWidthPercent(
      value ?? WORKSPACE_WIDTH_DEFAULT,
    );
    setWorkspaceWidthPercent(clamped);
    applyWorkspaceWidth(clamped);
    if (widthPersistTimerRef.current !== null) {
      window.clearTimeout(widthPersistTimerRef.current);
    }
    widthPersistTimerRef.current = window.setTimeout(() => {
      widthPersistTimerRef.current = null;
      void persistInterfaceSettings({ workspaceWidthPercent: clamped });
    }, 200);
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
    <Stack direction="column" align="stretch" gap="md">
      {/* ── Workspace Content Width Section ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="SlidersHorizontal"
          title="Workspace Content Width"
          badge={
            <Badge variant="neutral" size="xs">
              Home Pages &amp; Docs
            </Badge>
          }
          subtitle="Adjust how much horizontal screen space the Playthroughs, Characters, Lorebooks, Personas, and Documentation pages occupy on wide screens (50% to 100%)."
        />

        <Slider
          label="Workspace Width"
          rangeHint={`${WORKSPACE_WIDTH_MIN}% – ${WORKSPACE_WIDTH_MAX}%`}
          value={workspaceWidthPercent}
          onChange={handleWorkspaceWidthChange}
          min={WORKSPACE_WIDTH_MIN}
          max={WORKSPACE_WIDTH_MAX}
          step={1}
          defaultPreview={WORKSPACE_WIDTH_DEFAULT}
          integer
          clamp
          unit="%"
        />
      </Stack>

      <Separator spacing="none" />

      {/* ── Avatar Badge Shape Section ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Sparkles"
          title="Avatar Badge Shape"
          badge={
            <Badge variant="neutral" size="xs">
              Cast, NPCs &amp; Personas
            </Badge>
          }
          subtitle="Choose the shape for entity identity badges across the Player tab, Main Cast compact roster, Background NPCs, and Persona selectors."
        />

        <FormGrid cols={3} gap="xs">
          {SHAPE_OPTIONS.map((opt) => {
            const isSelected = avatarShape === opt.id;
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
                onClick={() => void handleSelectShape(opt.id)}
              >
                <Stack direction="column" align="stretch" gap="xs">
                  <Card variant="panel" padding="xs">
                    <Stack direction="row" align="center" gap="sm">
                      <AvatarBadge
                        name="Mira"
                        size="md"
                        shape={opt.badgePreviewShape}
                      />
                      <Stack direction="column" align="start" gap="none">
                        <Text
                          as="strong"
                          size="xs"
                          weight="semibold"
                          tone="primary"
                        >
                          Mira Vane
                        </Text>
                        <Text as="span" variant="caption" tone="muted">
                          Main Cast · In Scene
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
      </Stack>

      <Separator spacing="none" />

      {/* ── Cover Art Section ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Image"
          title="Cover Art"
          badge={
            <Badge variant="neutral" size="xs">
              Playthrough Library
            </Badge>
          }
          subtitle="Choose the shape of every cover on the playthrough shelf. A cover fills its frame, so picking the shape that matches the images your stories produce crops the least."
        />

        <FormGrid cols={3} gap="xs">
          {ASPECT_OPTIONS.map((opt) => {
            const isSelected = coverAspect === opt.id;
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
                onClick={() => handleSelectAspect(opt.id)}
              >
                <Stack direction="column" align="stretch" gap="xs">
                  <Card variant="panel" padding="xs">
                    <Stack direction="row" align="center" gap="sm">
                      <CoverAspectPreview aspect={opt.id} />
                      <Stack direction="column" align="start" gap="2xs">
                        <Badge variant="neutral" size="xs">
                          {opt.ratio}
                        </Badge>
                        <Text as="span" variant="caption" tone="muted">
                          {opt.frameHint}
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
      </Stack>

      {/* ── Mobile Panels Section ──
          Offered only where the single-panel layout exists: above the app's breakpoint every panel is
          already on screen and the tab bar is gone, so the row is hidden by CSS rather than rendered
          conditionally — the panel keeps one markup path. */}
      <Stack direction="column" align="stretch" gap="xs" mobileOnly>
        <Separator spacing="none" />
        <Header
          variant="section"
          icon="MoveHorizontal"
          title="Mobile Panels"
          badge={
            <Badge variant="neutral" size="xs">
              Narrow Screens
            </Badge>
          }
          subtitle="How the play view moves between Scene, Chat and Info on a narrow screen."
        />
        <SwitchRow
          icon="MoveHorizontal"
          title="Swipe Between Panels"
          description="Drag horizontally to move between the panels. The bottom tab bar always works; turn this off if a scroll that drifts sideways keeps pulling a panel with it."
          checked={paneSwipeEnabled}
          onChange={(e) => handleTogglePaneSwipe(e.target.checked)}
        />
      </Stack>
    </Stack>
  );
}
export default InterfaceSettingsPanel;
