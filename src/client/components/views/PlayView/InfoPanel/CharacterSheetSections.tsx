import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  PHYSICAL_SECTION_HEADERS,
  pickSections,
  isStubSection,
  type ContentSection,
} from "../../../../../engine/characterSections";
import {
  latestChange,
  type SectionChange,
} from "../../../../engine/sheetProvenance";
import { Badge, Icon, Stack, Text, Tooltip, type IconName } from "../../../base";

type CharacterSheetSectionsProps = {
  content: string;
  /** Which sections to render, in the sheet's own order. Defaults to the physical trio the info card
   *  peeks at; the full sheet passes every header it has. */
  headers?: readonly string[];
  /** Visual presentation style: `"prose"` (default, for full sheet reader) or `"badges"` (compact attribute chips, matching PlayerTab). */
  variant?: "prose" | "badges";
  /** What the story changed in each section, from the turn log. Keys match case-insensitively. */
  marks?: Map<string, SectionChange[]>;
  /** Per-section extra content, after the body: the sheet's drift marker and its restore action. */
  renderSectionExtra?: (section: ContentSection) => ReactNode;
};

function resolveSectionIcon(header: string): IconName | undefined {
  const norm = header.trim().toLowerCase();
  if (norm === "body") return "Activity";
  if (norm === "appearance") return "Eye";
  if (norm === "clothing") return "Shirt";
  return undefined;
}

export function CharacterSheetSections({
  content,
  headers,
  variant = "prose",
  marks,
  renderSectionExtra,
}: CharacterSheetSectionsProps) {
  const sections = useMemo(
    () => pickSections(content, headers ?? PHYSICAL_SECTION_HEADERS),
    [content, headers],
  );

  /** The log spells the header the way the patch did, so the match is case-insensitive. */
  const changesFor = (header: string): SectionChange[] | null => {
    if (!marks || marks.size === 0) return null;
    const exact = marks.get(header);
    if (exact) return exact;
    const wanted = header.trim().toLowerCase();
    for (const [key, value] of marks) {
      if (key.trim().toLowerCase() === wanted) return value;
    }
    return null;
  };

  if (sections.length === 0) return null;
  return (
    <Stack direction="column" align="stretch" gap="sm" fullWidth>
      {sections.map((section, i) => {
        const stub = isStubSection(section);
        const lines = section.body
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const changes = changesFor(section.header);
        const latest = latestChange(changes ?? undefined);
        const iconName =
          variant === "badges" ? resolveSectionIcon(section.header) : undefined;

        return (
          <Stack
            as="section"
            direction="column"
            align="stretch"
            gap="xs"
            fullWidth
            key={`${section.header}-${i}`}
          >
            <Stack direction="row" align="center" gap="xs" wrap>
              {iconName ? <Icon name={iconName} size={12} /> : null}
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="secondary"
                uppercase
              >
                {section.header}
              </Text>
              {latest ? (
                <Tooltip
                  content={
                    <Stack direction="column" gap="2xs">
                      {(changes ?? []).map((change, index) => (
                        <Text key={index} as="span" size="xs">
                          turn {change.turn} — {change.note || "updated"}
                        </Text>
                      ))}
                    </Stack>
                  }
                >
                  {/* The story grew this section; the turn is the anchor back to the exchange that did it. */}
                  <Badge variant="accent" size="xs" pill>
                    changed · turn {latest.turn}
                  </Badge>
                </Tooltip>
              ) : null}
            </Stack>
            {stub ? (
              <Text as="p" size="xs" tone="muted" italic>
                (not established)
              </Text>
            ) : variant === "badges" ? (
              renderSheetBadges(lines)
            ) : (
              renderSheetBody(lines)
            )}
            {renderSectionExtra?.(section)}
          </Stack>
        );
      })}
    </Stack>
  );
}

function renderSheetBadges(lines: string[]): ReactNode {
  const items = lines.map((line) => {
    const cleaned = line.replace(/^\s*[-•]\s*/, "").trim();
    const match = cleaned.match(/^([^:]+):\s*(.+)$/);
    return match
      ? { key: match[1].trim(), value: match[2].trim() }
      : { value: cleaned };
  });

  return (
    <Stack direction="row" align="center" gap="xs" wrap fullWidth>
      {items.map((item, i) => (
        <Badge key={i} variant="outline" size="sm">
          {item.key ? (
            <Text as="span" size="xs" tone="muted" weight="medium">
              {item.key}:
            </Text>
          ) : null}
          <Text as="span" size="xs" weight="medium">
            {item.value}
          </Text>
        </Badge>
      ))}
    </Stack>
  );
}

function renderSheetBody(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    out.push(
      <Stack
        key={`ul-${out.length}`}
        direction="column"
        align="stretch"
        gap="2xs"
        fullWidth
      >
        {bullets.map((b, i) => {
          const cleaned = b.replace(/^-\s*/, "").trim();
          const match = cleaned.match(/^([^:]+):\s*(.+)$/);
          return (
            <Stack key={i} direction="row" align="baseline" gap="xs" fullWidth>
              <Text as="span" size="xs" tone="muted">
                •
              </Text>
              <Text as="span" size="xs" leading="snug">
                {match ? (
                  <>
                    <Text as="span" size="xs" tone="secondary" weight="semibold">
                      {match[1].trim()}:
                    </Text>{" "}
                    {match[2].trim()}
                  </>
                ) : (
                  cleaned
                )}
              </Text>
            </Stack>
          );
        })}
      </Stack>,
    );
    bullets = [];
  };
  for (const line of lines) {
    if (line.startsWith("- ")) bullets.push(line);
    else {
      flush();
      out.push(
        <Text key={`p-${out.length}`} as="p" size="xs" leading="snug" preWrap>
          {line}
        </Text>,
      );
    }
  }
  flush();
  return out;
}
