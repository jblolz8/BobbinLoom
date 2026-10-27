import { getPersonaAvatarUrl, type Persona } from "../../../api";
import {
  AvatarBadge,
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  Stack,
  Text,
} from "../../base";

export type PersonaStepPanelProps = {
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  onOpenPersonaManager?: () => void;
};

export function PersonaStepPanel({
  personas,
  selectedPersonaId,
  onSelectPersona,
  onOpenPersonaManager,
}: PersonaStepPanelProps) {
  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      <Header
        variant="section"
        title="Choose Your Persona"
        subtitle="Select the identity and perspective your player character will take during the story."
        actions={
          onOpenPersonaManager ? (
            <Button
              variant="secondary"
              size="xs"
              leftIcon="User"
              onClick={onOpenPersonaManager}
            >
              Manage Personas
            </Button>
          ) : undefined
        }
      />

      {personas.length === 0 ? (
        <Card variant="panel" padding="lg" fullWidth>
          <Stack direction="column" align="center" gap="sm">
            <Icon name="User" size={28} />
            <Text size="md" weight="semibold">
              No personas found
            </Text>
            <Text size="sm" tone="secondary" align="center">
              Create a persona in Persona Manager to define your
              protagonist&apos;s name, appearance, and traits.
            </Text>
            {onOpenPersonaManager ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon="Plus"
                onClick={onOpenPersonaManager}
              >
                Open Persona Manager
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : (
        <FormGrid cols={3} gap="sm">
          {personas.map((p) => {
            const isSelected = selectedPersonaId === p.id;
            return (
              <Card
                key={p.id}
                variant="elevated"
                padding="sm"
                layout="column"
                hoverable
                active={isSelected}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => onSelectPersona(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectPersona(p.id);
                  }
                }}
              >
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  gap="sm"
                  fullWidth
                >
                  <Stack
                    direction="row"
                    align="center"
                    gap="sm"
                    flex1
                    fullWidth
                  >
                    <AvatarBadge
                      src={getPersonaAvatarUrl(
                        p.id,
                        "profile",
                        p.avatarUpdatedAt,
                      )}
                      icon="User"
                      name={p.name}
                      size="sm"
                    />
                    <Stack direction="row" align="center" gap="xs" wrap flex1>
                      <Text size="sm" weight="semibold" truncate>
                        {p.name}
                      </Text>
                      {p.isDefault ? (
                        <Badge
                          variant="warning"
                          size="xs"
                          leftIcon="Star"
                          title="Default Persona"
                        >
                          Default
                        </Badge>
                      ) : null}
                    </Stack>
                  </Stack>

                  <Card.SelectIndicator checked={isSelected} />
                </Stack>

                <Text
                  as="p"
                  size="xs"
                  tone={p.description ? "secondary" : "muted"}
                  lineClamp={3}
                  title={p.description || undefined}
                >
                  {p.description || "No description provided."}
                </Text>
              </Card>
            );
          })}
        </FormGrid>
      )}
    </Stack>
  );
}
