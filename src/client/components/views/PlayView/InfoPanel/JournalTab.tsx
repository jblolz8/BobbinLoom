import { useEffect, useMemo, useState } from "react";
import type { LorebookSummary, MemoryEvent, Playthrough } from "../../../../../schemas";
import { closeChapter, listLorebooks, type CloseChapterBody, type TokenUsage } from "../../../../api";
import { AvatarBadge, Icon } from "../../../base";

export function JournalTab({
  playthrough,
  onPlaythroughChange,
  onViewChapter,
  onCloseChapterComplete,
  onStartNewWithSameScenario,
  onOpenTimelines
}: {
  playthrough: Playthrough;
  onPlaythroughChange: (updated: Playthrough) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  onStartNewWithSameScenario: (scenarioDescription: string, personaId: string | undefined, initialCastIds: string[] | undefined, originalName: string) => void;
  onOpenTimelines?: () => void;
}) {
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [addClosingMessage, setAddClosingMessage] = useState(false);
  const [closingMessage, setClosingMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [lorebookSummaries, setLorebookSummaries] = useState<LorebookSummary[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  // Filter state for timeline events
  const [eventSearch, setEventSearch] = useState("");
  const [minImportance, setMinImportance] = useState<number>(0);

  useEffect(() => {
    listLorebooks().then(setLorebookSummaries).catch(() => setLorebookSummaries([]));
  }, [playthrough.id]);

  const attachedLorebooks = lorebookSummaries.filter(lb => playthrough.lorebookIds?.includes(lb.id));

  const events = useMemo(() => {
    const all = new Map<string, MemoryEvent>();
    for (const e of playthrough.memoryLayers?.compressed ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryLayers?.recent ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryEvents) all.set(e.id, e);
    return [...all.values()].sort((a, b) => b.turn - a.turn);
  }, [playthrough]);

  type ChapterEventGroup = {
    chapterId: string | null;
    chapterName: string;
    turnRange?: { start: number; end: number };
    metaSummary?: string;
    events: MemoryEvent[];
  };

  const chapterGroups = useMemo((): ChapterEventGroup[] => {
    const all = new Map<string, MemoryEvent>();
    for (const e of playthrough.memoryLayers?.compressed ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryLayers?.recent ?? []) all.set(e.id, e);
    for (const e of playthrough.memoryEvents) all.set(e.id, e);

    const currentEvents: MemoryEvent[] = [];
    const archiveMap = new Map<string, MemoryEvent[]>();

    for (const e of all.values()) {
      if (e.chapterId) {
        const bucket = archiveMap.get(e.chapterId) ?? [];
        bucket.push(e);
        archiveMap.set(e.chapterId, bucket);
      } else {
        currentEvents.push(e);
      }
    }

    const metas = playthrough.storyMetaSummaries ?? [];
    const foldedIds = new Set<string>();
    for (const m of metas) for (const id of m.chapterIds) foldedIds.add(id);

    const groups: ChapterEventGroup[] = [];

    groups.push({
      chapterId: null,
      chapterName: "Current Chapter",
      events: currentEvents.sort((a, b) => b.turn - a.turn),
    });

    const archived = [...(playthrough.chapters ?? [])].reverse();
    for (const ch of archived) {
      if (foldedIds.has(ch.id)) continue;
      const chEvents = archiveMap.get(ch.id) ?? [];
      if (chEvents.length === 0) continue;
      groups.push({
        chapterId: ch.id,
        chapterName: ch.name,
        turnRange: ch.turnRange,
        events: chEvents.sort((a, b) => b.turn - a.turn),
      });
    }

    if (metas.length > 0) {
      const latest = metas[metas.length - 1];
      const metaEvents: MemoryEvent[] = [];
      for (const id of latest.chapterIds) {
        const evts = archiveMap.get(id) ?? [];
        for (const e of evts) metaEvents.push(e);
      }
      if (metaEvents.length > 0 || latest.summary) {
        groups.push({
          chapterId: "compacted",
          chapterName: `Chapters ${latest.chapterIds.length} (compacted)`,
          turnRange: latest.turnRange,
          metaSummary: latest.summary,
          events: metaEvents.sort((a, b) => b.turn - a.turn),
        });
      }
    }

    return groups;
  }, [playthrough]);

  // Filtered groups based on search & importance
  const filteredChapterGroups = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return chapterGroups.map(group => {
      const filteredEvents = group.events.filter(e => {
        if (minImportance > 0 && e.importance < minImportance) return false;
        if (query) {
          const matchSummary = e.summary?.toLowerCase().includes(query);
          const matchType = e.type?.toLowerCase().includes(query);
          const matchTurn = `t${e.turn}`.toLowerCase().includes(query);
          if (!matchSummary && !matchType && !matchTurn) return false;
        }
        return true;
      });
      return {
        ...group,
        events: filteredEvents,
      };
    }).filter(group => group.events.length > 0 || (!query && minImportance === 0 && group.chapterId === null));
  }, [chapterGroups, eventSearch, minImportance]);

  const visibleMessages = playthrough.messages.filter(m => !m.hidden && !m.chapterId);
  const canClose = visibleMessages.length >= 6;

  async function handleCloseChapter() {
    setClosing(true);
    try {
      const body: CloseChapterBody = { addClosingMessage, closingMessage: addClosingMessage ? closingMessage : undefined };
      const { state, tokenUsage } = await closeChapter(playthrough.id, body);
      onPlaythroughChange(state);
      onCloseChapterComplete(tokenUsage);
      setCloseModalOpen(false);
      setAddClosingMessage(false);
      setClosingMessage("");
    } catch (e) {
      // handled
    } finally {
      setClosing(false);
    }
  }

  function toggleExpand(chapterId: string) {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
  }

  function renderStars(importance: number) {
    const count = Math.max(1, Math.min(5, Math.round(importance)));
    return (
      <div className="timeline-stars" title={`Importance: ${importance.toFixed(1)}/5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Icon
            key={i}
            name="Star"
            size={11}
            className="timeline-star-icon"
            style={{ opacity: i < count ? 1 : 0.2 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="journal-tab-container">
      {/* Header Row */}
      <div className="journal-header-row">
        <h2 className="journal-header-title">
          <Icon name="BookOpen" size={20} />
          <span>Journal</span>
        </h2>
        {onOpenTimelines ? (
          <button
            className="journal-timelines-btn"
            onClick={onOpenTimelines}
            title="View alternative timeline branches for this playthrough"
          >
            <Icon name="GitFork" size={14} />
            <span>View Timelines</span>
          </button>
        ) : null}
      </div>

      {/* About this Playthrough (Setting & Scenario) */}
      {playthrough.scenarioDescription ? (
        <article className="journal-card journal-about-card">
          <div className="journal-card-header">
            <h3 className="journal-section-title">
              <Icon name="Compass" size={15} />
              <span>Setting & Scenario</span>
            </h3>
          </div>
          <p className="about-synopsis-text">{playthrough.scenarioDescription}</p>
          <div className="about-actions">
            <button
              className="start-same-scenario-btn"
              onClick={() => onStartNewWithSameScenario(
                playthrough.scenarioDescription!,
                playthrough.personaId,
                playthrough.initialCastIds,
                playthrough.name,
              )}
              title="Start a new game using this scenario, cast, and persona"
            >
              <Icon name="Copy" size={13} />
              <span>Start New with Same Scenario</span>
            </button>
          </div>
        </article>
      ) : null}

      {/* Lorebooks */}
      <section className="journal-card">
        <div className="journal-card-header">
          <h3 className="journal-section-title">
            <Icon name="BookMarked" size={15} />
            <span>Lorebooks</span>
          </h3>
          {attachedLorebooks.length > 0 ? (
            <span className="lorebook-count-badge">{attachedLorebooks.length} attached</span>
          ) : null}
        </div>
        {attachedLorebooks.length === 0 ? (
          <div className="info-empty-state">
            <Icon name="BookX" size={15} />
            <span>No lorebooks attached to this playthrough</span>
          </div>
        ) : (
          <div className="lorebooks-grid">
            {attachedLorebooks.map((lb) => (
              <div key={lb.id} className="lorebook-pill" title={`${lb.entryCount} active lore entries`}>
                <Icon name="BookOpen" size={13} />
                <span>{lb.name}</span>
                <span className="lorebook-count-badge">{lb.entryCount} entries</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chapters (The Chronicle) */}
      <section className="journal-card">
        <div className="journal-card-header">
          <h3 className="journal-section-title">
            <Icon name="Scroll" size={15} />
            <span>Chapters</span>
          </h3>
          <span className="lorebook-count-badge">
            {(playthrough.chapters?.length ?? 0) + 1} volumes
          </span>
        </div>

        <div className="chapters-section-body">
          {/* Active / Current Chapter */}
          <div className="chapter-current-banner">
            <div className="current-chapter-header">
              <h4 className="current-chapter-title">
                <Icon name="BookOpen" size={15} color="#38bdf8" />
                <span>Current Chapter</span>
              </h4>
              <span className="current-chapter-status">
                <span className="current-chapter-status-dot" />
                <span>Ongoing</span>
              </span>
            </div>

            <div className="current-chapter-controls">
              <span className="chapter-progress-hint">
                {visibleMessages.length} message{visibleMessages.length === 1 ? "" : "s"} in session
                {!canClose ? ` (need ${6 - visibleMessages.length} more to close)` : " · Ready to summarize"}
              </span>
              <button
                className="close-chapter-btn"
                disabled={!canClose || closing}
                onClick={() => setCloseModalOpen(true)}
                title={!canClose ? "Play a bit longer before closing this chapter" : "Close and summarize this chapter into an archived volume"}
              >
                <Icon name="BookmarkCheck" size={13} />
                <span>{closing ? "Closing…" : "Close Chapter"}</span>
              </button>
            </div>
          </div>

          {/* Archived Volumes */}
          {[...(playthrough.chapters ?? [])].length > 0 ? (
            <ul className="archived-volumes-list">
              {[...(playthrough.chapters ?? [])].reverse().map((ch) => {
                const isExpanded = expandedChapters.has(ch.id);
                return (
                  <li key={ch.id} className="archived-volume-card">
                    <div className="volume-header" onClick={() => toggleExpand(ch.id)}>
                      <div className="volume-title-group">
                        <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={14} color="#94a3b8" />
                        <h4>{ch.name}</h4>
                      </div>
                      <div className="volume-meta-pills">
                        <span className="volume-pill">
                          T{ch.turnRange.start} – T{ch.turnRange.end}
                        </span>
                      </div>
                    </div>

                    {ch.shortDescription && !isExpanded ? (
                      <div style={{ padding: "0.4rem 0.85rem 0.6rem 2.1rem" }}>
                        <p className="volume-short-desc" style={{ margin: 0 }}>{ch.shortDescription}</p>
                      </div>
                    ) : null}

                    {isExpanded ? (
                      <div className="volume-body">
                        {ch.shortDescription ? (
                          <p className="volume-short-desc">{ch.shortDescription}</p>
                        ) : null}
                        <p className="volume-full-summary">{ch.fullSummary}</p>
                        <div className="volume-actions-bar">
                          <span
                            className="volume-date-meta"
                            title={`Archived: ${ch.createdAt ? new Date(ch.createdAt).toLocaleString() : "Unknown"}${ch.summaryDurationMs ? ` (summarized in ${(ch.summaryDurationMs / 1000).toFixed(1)}s)` : ""}`}
                          >
                            {ch.createdAt ? new Date(ch.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""}
                          </span>
                          <button
                            className="view-transcript-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewChapter(ch.id);
                            }}
                          >
                            <Icon name="FileText" size={12} />
                            <span>View Transcript</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="info-empty-state">
              <Icon name="Layers" size={15} />
              <span>No archived chapters yet. When you close a chapter, its transcript and summary will be saved here.</span>
            </div>
          )}
        </div>
      </section>

      {/* Close Chapter Modal */}
      {closeModalOpen ? (
        <div className="modal-overlay" onClick={() => setCloseModalOpen(false)}>
          <div className="modal close-chapter-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Icon name="BookmarkCheck" size={20} color="#38bdf8" />
              <h3 style={{ margin: 0 }}>Close Chapter</h3>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.86rem", lineHeight: 1.5, margin: "0 0 1rem 0" }}>
              The current ongoing chapter will be closed and summarized into an archived volume. The turn history and memories will remain preserved.
            </p>
            <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer", marginBottom: "0.75rem" }}>
              <input
                type="checkbox"
                checked={addClosingMessage}
                onChange={e => setAddClosingMessage(e.target.checked)}
              />
              <span>Add custom closing note or author remark</span>
            </label>
            {addClosingMessage ? (
              <textarea
                value={closingMessage}
                onChange={e => setClosingMessage(e.target.value)}
                placeholder="Write a closing remark or scene resolution…"
                style={{
                  width: "100%",
                  minHeight: "5rem",
                  background: "#10151f",
                  border: "1px solid #303849",
                  borderRadius: "8px",
                  padding: "0.6rem",
                  color: "#eceff4",
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
                  resize: "vertical"
                }}
              />
            ) : null}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                className="primary-btn"
                disabled={closing}
                onClick={handleCloseChapter}
              >
                {closing ? "Closing & Summarizing…" : "Confirm & Close"}
              </button>
              <button onClick={() => setCloseModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dramatis Personae (Cast & Acquaintances) */}
      <section className="journal-card">
        <div className="journal-card-header">
          <h3 className="journal-section-title">
            <Icon name="Users" size={15} />
            <span>Dramatis Personae</span>
          </h3>
          <span className="lorebook-count-badge">
            {playthrough.characters.length + playthrough.npcs.length} persons
          </span>
        </div>

        {playthrough.characters.length === 0 && playthrough.npcs.length === 0 ? (
          <div className="info-empty-state">
            <Icon name="UserX" size={15} />
            <span>No cast or characters encountered yet</span>
          </div>
        ) : (
          <div className="dramatis-sections">
            {/* Playthrough Characters */}
            {playthrough.characters.length > 0 ? (
              <div>
                <h4 className="dramatis-group-header">Active Party & Cast</h4>
                <div className="dramatis-grid">
                  {playthrough.characters.map((c) => (
                    <div key={c.id} className="dramatis-card">
                      <AvatarBadge name={c.name} icon="User" size="sm" />
                      <div className="dramatis-info">
                        <div className="dramatis-title-row">
                          <strong className="dramatis-name">{c.name}</strong>
                        </div>
                        {c.memorySummary ? (
                          <p className="dramatis-desc">{c.memorySummary}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* NPCs */}
            {playthrough.npcs.length > 0 ? (
              <div>
                <h4 className="dramatis-group-header">Encountered NPCs</h4>
                <div className="dramatis-grid">
                  {playthrough.npcs.map((npc) => (
                    <div key={npc.id} className="dramatis-card npc">
                      <AvatarBadge name={npc.name} icon="Users" size="sm" />
                      <div className="dramatis-info">
                        <div className="dramatis-title-row">
                          <strong className="dramatis-name">{npc.name}</strong>
                          {npc.disposition ? (
                            <span className={`dramatis-disposition ${npc.disposition.toLowerCase()}`}>
                              {npc.disposition}
                            </span>
                          ) : null}
                        </div>
                        {npc.description ? (
                          <p className="dramatis-desc">{npc.description}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Event Timeline (Chronological Adventure Log) */}
      <section className="journal-card">
        <div className="journal-card-header">
          <h3 className="journal-section-title">
            <Icon name="Clock" size={15} />
            <span>Event Timeline</span>
          </h3>
          <span className="lorebook-count-badge">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Filter Toolbar */}
        <div className="timeline-filter-toolbar">
          <input
            type="text"
            className="timeline-search-input"
            placeholder="Search events (turn, type, text)…"
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
          />
          <div className="timeline-importance-filter" title="Filter by minimum importance">
            <button
              className={`importance-filter-btn ${minImportance === 0 ? "active" : ""}`}
              onClick={() => setMinImportance(0)}
            >
              All
            </button>
            <button
              className={`importance-filter-btn ${minImportance === 3 ? "active" : ""}`}
              onClick={() => setMinImportance(3)}
            >
              3★+
            </button>
            <button
              className={`importance-filter-btn ${minImportance === 4 ? "active" : ""}`}
              onClick={() => setMinImportance(4)}
            >
              4★+
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="info-empty-state">
            <Icon name="CalendarX" size={15} />
            <span>No recorded events yet</span>
          </div>
        ) : filteredChapterGroups.length === 0 ? (
          <div className="info-empty-state">
            <Icon name="Search" size={15} />
            <span>No events match current filter criteria</span>
          </div>
        ) : (
          <div className="vertical-timeline-container">
            {filteredChapterGroups.map((group) => {
              const groupKey = group.chapterId ?? "current";
              const isExpanded = group.chapterId === null || expandedChapters.has(group.chapterId);
              return (
                <div key={groupKey} className="timeline-chapter-accordion">
                  <div
                    className="timeline-chapter-accordion-header"
                    onClick={() => { if (group.chapterId) toggleExpand(group.chapterId); }}
                  >
                    <h4>
                      {group.chapterId ? (
                        <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={14} color="#94a3b8" />
                      ) : (
                        <Icon name="Bookmark" size={14} color="#38bdf8" />
                      )}
                      <span>{group.chapterName}</span>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>
                        ({group.events.length} event{group.events.length !== 1 ? "s" : ""})
                      </span>
                    </h4>
                    {group.turnRange ? (
                      <span className="volume-pill">T{group.turnRange.start} – T{group.turnRange.end}</span>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div>
                      {group.metaSummary ? (
                        <p className="timeline-meta-summary" style={{ padding: "0.5rem 0.8rem", margin: 0, borderBottom: "1px solid #232d3d" }}>
                          {group.metaSummary}
                        </p>
                      ) : null}

                      <ul className="vertical-timeline-track">
                        {group.events.map((e) => {
                          const isHigh = e.importance >= 4 && e.importance < 5;
                          const isCritical = e.importance >= 5;
                          return (
                            <li key={e.id} className="vertical-timeline-item">
                              <span
                                className={`timeline-dot ${isCritical ? "critical-importance" : isHigh ? "high-importance" : ""}`}
                              />
                              <div className="timeline-item-card">
                                <div className="timeline-item-header">
                                  <div className="timeline-item-meta">
                                    <span className="timeline-turn-badge">T{e.turn}</span>
                                    <span className="timeline-type-badge">{e.type}</span>
                                  </div>
                                  {renderStars(e.importance)}
                                </div>
                                <p className="timeline-item-summary">{e.summary}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
