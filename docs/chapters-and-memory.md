---
title: Chapters & memory
section: Playing
order: 30
---

# Chapters & memory

A long conversation cannot be sent to the model in full. BobbinLoom handles that with two
layers: **chapters** you close deliberately, and a **memory event** pipeline that keeps the
events that mattered.

## Chapters

A chapter is a save point. When you close one, the messages since the last chapter are
archived: they stay in the playthrough — you can still open the transcript — but they stop
being sent as chat history and are represented by a summary instead.

**Close Chapter** lives in the play view's Journal tab, and asks for one thing: an optional
closing message to include in the transcript that gets summarized. Closing produces:

1. a **summary** of the chapter — a name, a one-line description, and a full summary written
   by the model
2. a **chapter opening** — a fresh assistant message that starts the new chapter, so the chat
   is never left empty and the opening can be retried or edited like any other response
3. a **chapter tag** on the memory events in that chapter's turn range, which keeps the event
   timeline grouped by chapter

A chapter needs at least six visible messages before it can be closed.

Already-closed chapters can be re-summarized from the chat: the **Re-summarize previous
chapter** action re-runs the summary on the same archived transcript and updates the chapter's
name, description and summary. It does not regenerate the opening — Retry does that.

### Story So Far

Chapters are injected into the prompt as a `STORY SO FAR` block. To keep that block bounded no
matter how long the story runs, chapters roll up:

- the **three most recent** uncompacted chapters stay in the prompt verbatim
- once there are more than that, the oldest overflow folds into a single rolling
  **meta-summary**
- the first fold seeds the summary directly from that chapter's own summary, with no model
  call
- later folds ask the model to consolidate the existing meta-summary together with the new
  chapters, with high-importance memory events included verbatim

Folding never deletes a chapter: it only changes which form the story takes in the prompt. If
a consolidation call fails, the chapter ids still move into the meta-summary and the previous
summary text is kept, so the state stays coherent and the next fold recovers.

## Memory events

The model records memorable events as it plays: a short summary, a type, an importance
rating, and tags. Tags are what make retrieval work — they carry the character names,
location ids and quest ids the event belongs to, and the model is instructed to always include
them.

Events are stored in three places, and older ones rotate down:

| Layer | Holds |
|---|---|
| `memoryEvents` | The live event set — everything recent |
| `memoryLayers.recent` | The hand-off set, drained on rotation |
| `memoryLayers.compressed` | Older events, kept as a bounded archive |

Rotation is driven by event count, not by turns or messages: once the live set reaches **60
events**, those events and everything already in the hand-off set rotate into the compressed
layer, which keeps the newest **50** and drops what falls out the back. Rotation is the only
thing that retires an event — messages are never hidden to make room for memory.

Chapters tag the events inside their turn range, and the Journal's event timeline groups them
by chapter.

## How memory reaches the prompt

Memory retrieval is relevance-selected rather than "the last N events": the current scene is
embedded and candidate events are scored against it by cosine similarity, alongside their
importance and recency, within a fixed share of the prompt budget. The memory segments in the
context meter show how much of the budget they take on any given turn.

The scoring, the embedding call and the fallback when embeddings are unavailable are all
described in [Prompt architecture](prompt-architecture.md).
