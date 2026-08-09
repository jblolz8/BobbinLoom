import { useEffect, useMemo, useState } from "react";
import type { LorebookSummary, MemoryEvent, Playthrough } from "../../../../../schemas";
import { closeChapter, listLorebooks, type CloseChapterBody, type TokenUsage } from "../../../../api";

export function JournalTab({ playthrough, onPlaythroughChange, onViewChapter, onCloseChapterComplete, onStartNewWithSameScenario }: {
  playthrough: Playthrough;
  onPlaythroughChange: (updated: Playthrough) => void;
  onViewChapter: (chapterId: string) => void;
  onCloseChapterComplete: (tokenUsage: TokenUsage) => void;
  onStartNewWithSameScenario: (scenarioDescription: string, personaId: string | undefined, initialCastIds: string[] | undefined, originalName: string) => void;
}) {
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [addClosingMessage, setAddClosingMessage] = useState(false);
  const [closingMessage, setClosingMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [lorebookSummaries, setLorebookSummaries] = useState<LorebookSummary[]>([]);

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
      chapterName: "📖 Current Chapter",
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
          chapterName: `📚 Chapters ${latest.chapterIds.length} (compacted)`,
          turnRange: latest.turnRange,
          metaSummary: latest.summary,
          events: metaEvents.sort((a, b) => b.turn - a.turn),
        });
      }
    }

    return groups;
  }, [playthrough]);

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

  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  function toggleExpand(chapterId: string) {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
  }

  return (
    <>
      <h2>Journal</h2>

      {playthrough.scenarioDescription ? (
        <section className="playthrough-about">
          <h3>About this Playthrough</h3>
          <div className="about-setting">
            <label>Setting</label>
            <p>{playthrough.scenarioDescription}</p>
          </div>
          <button
            className="primary-btn"
            onClick={() => onStartNewWithSameScenario(
              playthrough.scenarioDescription!,
              playthrough.personaId,
              playthrough.initialCastIds,
              playthrough.name,
            )}
          >
            Start New with same Scenario
          </button>
        </section>
      ) : null}

      <h3>Lorebooks</h3>
      {attachedLorebooks.length === 0 ? (
        <p>No lorebooks attached to this playthrough.</p>
      ) : (
        <ul>
          {attachedLorebooks.map((lb) => (
            <li key={lb.id}>📖 {lb.name} ({lb.entryCount} entries)</li>
          ))}
        </ul>
      )}

      <h3>Chapters</h3>
      <ul className="chapters-list">
        <li className="chapter-row current">
          <div className="chapter-header">
            <h4>📖 Current Chapter (ongoing)</h4>
            <button
              disabled={!canClose || closing}
              onClick={() => setCloseModalOpen(true)}
              title={!canClose ? "Play a bit longer before closing a chapter" : "Close and summarize this chapter"}
            >
              {closing ? "Closing…" : "Close Chapter"}
            </button>
          </div>
        </li>

        {[...(playthrough.chapters ?? [])].reverse().map((ch) => {
          const isExpanded = expandedChapters.has(ch.id);
          return (
            <li key={ch.id} className="chapter-row">
              <div className="chapter-header" onClick={() => toggleExpand(ch.id)}>
                <h4>{isExpanded ? "▼" : "▶"} {ch.name}</h4>
              </div>
              <p className="chapter-short">{ch.shortDescription}</p>
              {isExpanded ? (
                <>
                  <p className="chapter-summary">{ch.fullSummary}</p>
                  <div className="chapter-actions">
                    <span className="event-meta">T{ch.turnRange.start} – T{ch.turnRange.end}</span>
                    <button onClick={(e) => { e.stopPropagation(); onViewChapter(ch.id); }}>View Transcript</button>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
        {(playthrough.chapters ?? []).length === 0 ? (
          <li><p>No saved chapters yet.</p></li>
        ) : null}
      </ul>

      {closeModalOpen ? (
        <div className="modal-overlay" onClick={() => setCloseModalOpen(false)}>
          <div className="modal close-chapter-modal" onClick={e => e.stopPropagation()}>
            <h3>Close Chapter</h3>
            <p>The current chat session will be closed and summarized into a named chapter.</p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={addClosingMessage}
                onChange={e => setAddClosingMessage(e.target.checked)}
              />
              Add closing message
            </label>
            {addClosingMessage ? (
              <textarea
                value={closingMessage}
                onChange={e => setClosingMessage(e.target.value)}
                placeholder="Write a closing message to end the chapter…"
              />
            ) : null}
            <div className="modal-actions">
              <button disabled={closing} onClick={handleCloseChapter}>
                {closing ? "Closing…" : "Close Chapter"}
              </button>
              <button onClick={() => setCloseModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      <h3>Dramatis Personae</h3>
      {playthrough.characters.length === 0 && playthrough.npcs.length === 0 ? (
        <p>No one met yet.</p>
      ) : (
        <ul className="dramatis-list">
          {playthrough.characters.map((c) => (
            <li key={c.id}><strong>{c.name}</strong>{c.memorySummary ? ` — ${c.memorySummary}` : ""}</li>
          ))}
          {playthrough.npcs.map((npc) => (
            <li key={npc.id} className="dramatis-background">
              <strong>{npc.name}</strong>{npc.disposition ? ` (${npc.disposition})` : ""} — {npc.description}
            </li>
          ))}
        </ul>
      )}

      <h3>Event Timeline</h3>
      {events.length === 0 ? (
        <p>No recorded events yet.</p>
      ) : (
        <ul className="journal-timeline">
          {chapterGroups.map((group) => {
            const groupKey = group.chapterId ?? "current";
            const isExpanded = group.chapterId === null || expandedChapters.has(group.chapterId);
            return (
              <li key={groupKey} className="timeline-chapter-group">
                <div
                  className="chapter-header timeline-header"
                  onClick={() => { if (group.chapterId) toggleExpand(group.chapterId); }}
                >
                  <h4>
                    {group.chapterId
                      ? `${isExpanded ? "▼" : "▶"} ${group.chapterName} — ${group.events.length} event${group.events.length !== 1 ? "s" : ""}`
                      : `${group.chapterName} — ${group.events.length} event${group.events.length !== 1 ? "s" : ""}`
                    }
                  </h4>
                  {group.turnRange ? (
                    <span className="event-meta">T{group.turnRange.start} – T{group.turnRange.end}</span>
                  ) : null}
                </div>
                {isExpanded ? (
                  <>
                    {group.metaSummary ? (
                      <p className="timeline-meta-summary">{group.metaSummary}</p>
                    ) : null}
                    <ul className="journal-timeline chapter-events">
                    {group.events.map((e) => (
                      <li key={e.id} className="journal-event">
                        <span className="event-meta">T{e.turn} · {e.type}</span>
                        <span className="event-importance" title={`Importance ${e.importance}`}>{"★".repeat(Math.max(1, Math.min(5, Math.round(e.importance))))}</span>
                        <p>{e.summary}</p>
                      </li>
                    ))}
                    </ul>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
