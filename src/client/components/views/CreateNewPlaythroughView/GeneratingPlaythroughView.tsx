import {
  Badge,
  Button,
  Card,
  Separator,
  Spinner,
  Stack,
  Text,
} from "../../base";

export type GeneratingPlaythroughViewProps = {
  openingMode: "quick" | "fleshedOut";
  genProgressPhase?: string | null;
  personaName: string;
  selectedCastCount: number;
  selectedLorebookCount: number;
  textProviderLabel: string;
  onCancelGenerate: () => void;
};

export function GeneratingPlaythroughView({
  openingMode,
  genProgressPhase,
  personaName,
  selectedCastCount,
  selectedLorebookCount,
  textProviderLabel,
  onCancelGenerate,
}: GeneratingPlaythroughViewProps) {
  return (
    <Stack
      direction="column"
      align="center"
      justify="center"
      gap="md"
      fullWidth
    >
      <Spinner size={36} />

      <Stack direction="column" align="center" gap="xs">
        <Text as="h3" size="lg" weight="bold" align="center">
          Weaving Your Playthrough…
        </Text>
        <Text size="sm" tone="secondary" align="center">
          {genProgressPhase ||
            (openingMode === "fleshedOut"
              ? "Generating world scenario, characters, and writing the opening scene (2-stage narrative)…"
              : "Generating starting scenario, character state, and initial scene…")}
        </Text>
      </Stack>

      <Card variant="elevated" padding="md" fullWidth>
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Text size="xs" tone="secondary">
              Persona
            </Text>
            <Badge variant="neutral" size="xs">
              {personaName || "None"}
            </Badge>
          </Stack>

          <Separator spacing="none" />

          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Text size="xs" tone="secondary">
              Starting Cast
            </Text>
            <Badge
              variant={selectedCastCount > 0 ? "accent" : "neutral"}
              size="xs"
            >
              {selectedCastCount === 0
                ? "None (Solo)"
                : `${selectedCastCount} character${selectedCastCount === 1 ? "" : "s"}`}
            </Badge>
          </Stack>

          <Separator spacing="none" />

          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Text size="xs" tone="secondary">
              Lorebooks
            </Text>
            <Badge
              variant={selectedLorebookCount > 0 ? "info" : "neutral"}
              size="xs"
            >
              {selectedLorebookCount === 0
                ? "None"
                : `${selectedLorebookCount} selected`}
            </Badge>
          </Stack>

          <Separator spacing="none" />

          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Text size="xs" tone="secondary">
              Text Provider
            </Text>
            <Text size="xs" weight="semibold" truncate>
              {textProviderLabel}
            </Text>
          </Stack>

          <Separator spacing="none" />

          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            fullWidth
          >
            <Text size="xs" tone="secondary">
              Opening Mode
            </Text>
            <Badge variant="accent" size="xs">
              {openingMode === "fleshedOut"
                ? "Fleshed-out opening"
                : "Quick start"}
            </Badge>
          </Stack>
        </Stack>
      </Card>

      <Button
        variant="danger"
        size="sm"
        leftIcon="X"
        onClick={onCancelGenerate}
      >
        Cancel Generation
      </Button>
    </Stack>
  );
}
