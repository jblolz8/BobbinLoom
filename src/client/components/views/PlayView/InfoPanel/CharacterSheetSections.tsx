import { useMemo } from "react";
import type { ReactNode } from "react";
import { PHYSICAL_SECTION_HEADERS, pickSections, isStubSection } from "../../../../../engine/characterSections";

type CharacterSheetSectionsProps = { content: string };

export function CharacterSheetSections({ content }: CharacterSheetSectionsProps) {
  const sections = useMemo(() => pickSections(content, PHYSICAL_SECTION_HEADERS), [content]);
  if (sections.length === 0) return null;
  return (
    <div className="char-sheet-sections">
      {sections.map((section, i) => {
        const stub = isStubSection(section);
        const lines = section.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        return (
          <section className="char-sheet-section" key={`${section.header}-${i}`}>
            <h4>{section.header}</h4>
            {stub ? <p className="sheet-stub">(not established)</p> : renderSheetBody(lines)}
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
