import { useEffect, useState } from "react";
import type { LoadFailure, Playthrough } from "../../../schemas";
import { listPlaythroughs, renamePlaythrough, type Persona } from "../../api";
import { PlaythroughActionsMenu } from "../common/PlaythroughActionsMenu";
import { CharacterLibrary } from "../library/CharacterLibrary";
import { LorebookLibrary } from "../library/LorebookLibrary";
import { PersonaLibrary } from "../library/PersonaLibrary";

export type HomeTab = "playthroughs" | "characters" | "lorebooks" | "personas";

export type HomeViewProps = {
  activeTab: HomeTab;
  onOpenPlaythrough: (playthrough: Playthrough) => void;
  onNewPlaythrough: () => void;
  onOpenSettings: () => void;
  onPersonasChanged: (personas: Persona[]) => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

export function HomeView({
  activeTab,
  onOpenPlaythrough,
  onNewPlaythrough,
  onPersonasChanged,
}: HomeViewProps) {
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [loadFailures, setLoadFailures] = useState<LoadFailure[]>([]);
  const [failuresDismissed, setFailuresDismissed] = useState(false);

  async function refresh() {
    try {
      const { playthroughs, failures } = await listPlaythroughs();
      setPlaythroughs(playthroughs);
      setLoadFailures(failures);
      setFailuresDismissed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function handleRenameRequest(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  async function confirmRename(id: string) {
    if (!renameDraft.trim()) return;
    try {
      const updated = await renamePlaythrough(id, renameDraft.trim());
      setPlaythroughs((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setRenamingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDuplicated(clone: Playthrough) {
    setPlaythroughs((prev) => [clone, ...prev]);
  }

  function handleDeleted() {
    void refresh();
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
          {loadFailures.length > 0 && !failuresDismissed ? (
            <div className="load-failure-banner">
              <div className="load-failure-banner-header">
                <span>
                  {loadFailures.length} playthrough(s) couldn't be loaded
                </span>
                <button
                  className="load-failure-dismiss"
                  onClick={() => setFailuresDismissed(true)}
                  aria-label="Dismiss load warnings"
                >
                  ×
                </button>
              </div>
              <details className="load-failure-details">
                <summary>Details</summary>
                <ul>
                  {loadFailures.map((f) => (
                    <li key={f.id}>
                      <strong>{f.name}</strong> — {f.reason}
                      {f.backupPath ? (
                        <span className="load-failure-backup">
                          {" "}
                          (backup: {f.backupPath})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}
          {loading ? (
            <p className="home-loading">Loading playthroughs…</p>
          ) : playthroughs.length === 0 ? (
            <div className="home-empty">
              <p>No playthroughs yet. Create one to get started.</p>
              <button className="primary-btn" onClick={onNewPlaythrough}>
                + New Playthrough
              </button>
            </div>
          ) : (
            <div className="playthrough-grid">
              {playthroughs.map((p) => {
                const locationName =
                  p.locationCatalog?.find((l) => l.id === p.locationId)?.name ??
                  p.locationId;
                return (
                  <article
                    key={p.id}
                    className="playthrough-card"
                    onClick={() => onOpenPlaythrough(p)}
                  >
                    <div className="playthrough-card-header">
                      {renamingId === p.id ? (
                        <>
                          <input
                            className="rename-input"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void confirmRename(p.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <span
                            className="rename-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              className="rename-action save"
                              title="Save"
                              onClick={() => void confirmRename(p.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  void confirmRename(p.id);
                                }
                              }}
                            >
                              ✓
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="rename-action cancel"
                              title="Cancel"
                              onClick={() => setRenamingId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setRenamingId(null);
                                }
                              }}
                            >
                              ✕
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <h3>{p.name}</h3>
                          <PlaythroughActionsMenu
                            playthroughId={p.id}
                            playthroughName={p.name}
                            onRenameRequest={handleRenameRequest}
                            onDuplicated={handleDuplicated}
                            onDeleted={handleDeleted}
                            onError={setError}
                          />
                        </>
                      )}
                    </div>
                    <div className="playthrough-card-meta">
                      <span>📍 {locationName}</span>
                      <span>Turn {p.turn}</span>
                      <span>
                        👤 {p.characters.length}{" "}
                        {p.characters.length === 1 ? "character" : "characters"}
                      </span>
                    </div>
                    <p className="playthrough-card-updated">
                      Updated {formatDate(p.updatedAt)}
                    </p>
                    {p.messages.length > 0 ? (
                      <p className="playthrough-card-preview">
                        {p.messages
                          .filter((m) => !m.hidden)
                          .slice(-1)[0]
                          ?.content.slice(0, 120) ?? ""}
                        …
                      </p>
                    ) : (
                      <p className="playthrough-card-preview">No messages yet.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
