import { useState } from "react";
import type { Playthrough } from "../../../schemas";
import { getPlaythrough, type Persona } from "../../api";
import { PageShell, StatusMessage } from "../base";
import { PlaythroughLibrary } from "../library/PlaythroughLibrary";
import { CharacterLibrary } from "../library/CharacterLibrary";
import { LorebookLibrary } from "../library/LorebookLibrary";
import { PersonaLibrary } from "../library/PersonaLibrary";
import { DocsView } from "./DocsView";

export type HomeTab =
  | "playthroughs"
  | "characters"
  | "lorebooks"
  | "personas"
  | "docs";

export type HomeViewProps = {
  activeTab: HomeTab;
  onOpenPlaythrough: (playthrough: Playthrough) => void;
  onNewPlaythrough: () => void;
  onOpenSettings: () => void;
  onPersonasChanged: (personas: Persona[]) => void;
};

export function HomeView({
  activeTab,
  onOpenPlaythrough,
  onNewPlaythrough,
  onPersonasChanged,
}: HomeViewProps) {
  const [error, setError] = useState<string | null>(null);

  // Opening a card installs the live playthrough, so the full document is read here: the list
  // only carries the projection. The shelf itself owns everything else about the list — the
  // read, the view modes, the search and the pager — because the play view mounts the same
  // component as a dialog.
  async function openPlaythrough(id: string) {
    try {
      onOpenPlaythrough(await getPlaythrough(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <PageShell>
      {error ? (
        <StatusMessage variant="banner" tone="err">
          {error}
        </StatusMessage>
      ) : null}

      {activeTab === "characters" ? (
        <PageShell.Section>
          <CharacterLibrary variant="page" />
        </PageShell.Section>
      ) : activeTab === "lorebooks" ? (
        <PageShell.Section>
          <LorebookLibrary variant="page" />
        </PageShell.Section>
      ) : activeTab === "docs" ? (
        <PageShell.Section>
          <DocsView variant="page" />
        </PageShell.Section>
      ) : activeTab === "personas" ? (
        <PageShell.Section>
          <PersonaLibrary
            variant="page"
            onPersonasChanged={onPersonasChanged}
          />
        </PageShell.Section>
      ) : (
        <PageShell.Section>
          <PlaythroughLibrary
            variant="page"
            onOpen={(id) => {
              void openPlaythrough(id);
            }}
            onNewPlaythrough={onNewPlaythrough}
            onError={setError}
          />
        </PageShell.Section>
      )}
    </PageShell>
  );
}
