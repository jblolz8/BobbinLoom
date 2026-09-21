import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  PHYSICAL_SECTION_HEADERS,
  pickSections,
  isStubSection,
  type ContentSection
} from "../../../../../engine/characterSections";
import { latestChange, type SectionChange } from "../../../../engine/sheetProvenance";
import { Tooltip } from "../../../base";

type CharacterSheetSectionsProps = {
  content: string;
  /** Which sections to render, in the sheet's own order. Defaults to the physical trio the info card
   *  peeks at; the full sheet passes every header it has. */
  headers?: readonly string[];
  /** What the story changed in each section, from the turn log. Keys match case-insensitively. */
  marks?: Map<string, SectionChange[]>;
  /** Per-section extra content, after the body: the sheet's drift marker and its restore action. */
  renderSectionExtra?: (section: ContentSection) => ReactNode;
};

export function CharacterSheetSections({
  content,
  headers,
  marks,
  renderSectionExtra
}: CharacterSheetSectionsProps) {
  const sections = useMemo(
    () => pickSections(content, headers ?? PHYSICAL_SECTION_HEADERS),
    [content, headers]
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
    <div className="char-sheet-sections">
      {sections.map((section, i) => {
        const stub = isStubSection(section);
        const lines = section.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        const changes = changesFor(section.header);
        const latest = latestChange(changes ?? undefined);
        return (
          <section className="char-sheet-section" key={`${section.header}-${i}`}>
            <h4>
              {section.header}
              {latest ? (
                <Tooltip
                  content={
                    <span className="sheet-mark-lines">
                      {(changes ?? []).map((change, index) => (
                        <span key={index}>
                          turn {change.turn} — {change.note || "updated"}
                        </span>
                      ))}
                    </span>
                  }
                >
                  {/* The story grew this section; the turn is the anchor back to the exchange that did it. */}
                  <span className="sheet-mark">changed · turn {latest.turn}</span>
                </Tooltip>
              ) : null}
            </h4>
            {stub ? <p className="sheet-stub">(not established)</p> : renderSheetBody(lines)}
            {renderSectionExtra?.(section)}
          </section>
        );
      })}
    </div>
  );
}

function renderSheetBody(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="sheet-bullets">
        {bullets.map((b, i) => <li key={i}>{b.replace(/^-\s*/, "")}</li>)}
      </ul>
    );
    bullets = [];
  };
  for (const line of lines) {
    if (line.startsWith("- ")) bullets.push(line);
    else { flush(); out.push(<p key={`p-${out.length}`}>{line}</p>); }
  }
  flush();
  return out;
}
