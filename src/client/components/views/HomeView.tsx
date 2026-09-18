import { useState } from "react";
import type { Playthrough } from "../../../schemas";
import { getPlaythrough, type Persona } from "../../api";
import { PlaythroughLibrary } from "../library/PlaythroughLibrary";
import { CharacterLibrary } from "../library/CharacterLibrary";
import { LorebookLibrary } from "../library/LorebookLibrary";
import { PersonaLibrary } from "../library/PersonaLibrary";
import { DocsView } from "./DocsView";

export type HomeTab = "playthroughs" | "characters" | "lorebooks" | "personas" | "docs";

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
    <main className="app-shell home-workspace-shell">
      {error ? <pre className="error-box">{error}</pre> : null}

      {activeTab === "characters" ? (
        <section className="home-workspace-page">
          <div className="workspace-header-title">
            <h2>Character Library</h2>
            <p>Manage character templates for scenario generation and story casts.</p>
          </div>
          <CharacterLibrary />
        </section>
      ) : activeTab === "lorebooks" ? (
        <section className="home-workspace-page">
          <div className="workspace-header-title">
            <h2>Lorebook Library</h2>
            <p>Manage World Info lorebooks for prompt context injection.</p>
          </div>
          <LorebookLibrary />
        </section>
      ) : activeTab === "docs" ? (
        <section className="home-workspace-page docs-workspace-page">
          <DocsView />
        </section>
      ) : activeTab === "personas" ? (
        <section className="home-workspace-page">
          <div className="workspace-header-title">
            <h2>Persona Manager</h2>
            <p>Manage player character personas and initial clothing states.</p>
          </div>
          <PersonaLibrary onPersonasChanged={onPersonasChanged} />
        </section>
      ) : (
        <section className="home-page">
          <PlaythroughLibrary
            variant="page"
            onOpen={(id) => {
              void openPlaythrough(id);
            }}
            onNewPlaythrough={onNewPlaythrough}
            onError={setError}
          />
        </section>
      )}
    </main>
  );
}
