---
title: Playthroughs
section: Playing
order: 10
---

# Playthroughs

A playthrough is one story: its world, its cast, its chat history and its save points. The app
opens on the home screen, which lists every playthrough you have.

## The home screen

Each card shows the playthrough's name, its current location, turn count, cast size, when it
was last touched, and a two-line preview of the most recent message. The **⋮** menu in the
card header offers **Rename**, **Duplicate** and **Delete**, and the same menu is reused in
the save/load list inside the play view.

The header's four tabs — Playthroughs, Characters, Lorebooks, Personas — switch the home
screen between the playthrough list and the three libraries. Inside a playthrough those same
tabs open the matching manager as a dialog.

## Starting a new playthrough

**New Playthrough** opens a three-step setup: **persona → cast → setting**.

| Step | What you choose |
|---|---|
| Persona | The player character to copy into this playthrough. Optional — you can play without one |
| Cast | Which characters from your library start in the story. Defaults to empty; the picker never pre-selects for you |
| Setting | The name and the premise. The premise is the main creative input for scenario generation |

Two other things live on the setting step:

- **Opening mode** — *Quick start* uses the generated scenario's opening text as the first
  message and spends no extra call; *Fleshed-out opening* generates a written scene grounded
  in the setting and the cast.
- **Generate opening choices** (off by default) — also produce the first set of suggested
  choices alongside the opening.

**Start Blank** skips generation entirely. You get a minimal playthrough — no scenario, no
starter data, one unknown location — and your first message is the world-building.

With the premise in hand, generation produces a scenario seed: a location (or several,
connected), a lead character, a starting quest, some items, starting flags, and a background
roster of three to six minor characters. Characters from your cast picker are instantiated
alongside the generated cast.

## What a playthrough holds

A playthrough is one JSON document. The parts you'll see while playing:

| Field | What it is |
|---|---|
| `playerCharacter` | You — name, description, body type, appearance, clothing, conditions, flags |
| `characters` | The detailed cast: mood, attitude toward you, memory summary, clothing, conditions, flags, current location |
| `npcs` | Background characters, one line each, with an optional one-word disposition |
| `characterTemplates` | A local copy of each detailed character's sheet, so the story keeps its own version |
| `messages` | The chat, including hidden instruction messages and per-message metadata |
| `chapters` | Closed chapters, each with its transcript, summary and turn range |
| `storyMetaSummaries` | Older chapters rolled into a bounded rolling summary |
| `memoryEvents`, `memoryLayers` | The memory pipeline — see [Chapters & memory](chapters-and-memory.md) |
| `locationCatalog`, `itemCatalog` | The world's locations and items |
| `quests`, `inventory`, `flags` | World state |
| `lorebookIds`, `lorebookTimingStates` | Attached lorebooks and their per-entry timers |
| `snapshots` | One restore point per turn, which is what makes Retry possible |
| `scenarioDescription`, `personaId`, `initialCastIds` | Creation-time metadata, kept so a scenario can be replayed |
| `draft`, `draftUpdatedAt` | Your unsent input for this playthrough |
| `branchId`, `parentBranchId`, `rootPlaythroughId`, `isTimelineBranch`, `createdFromTurn` | Timeline placement — see [Timelines](timelines.md) |

## Drafts

Whatever you have typed but not sent is kept per playthrough. The client syncs it on a
debounce and the newest write wins, so a half-written message survives a reload, a tab
switch, or moving between playthroughs. Sending the message clears it.

## Duplicating

**Duplicate** deep-clones the entire playthrough — messages, snapshots, chapters, world state —
under a new id, and appends `(copy)` to the name. The clone is an exact checkpoint you can take
in a different direction without touching the original.

## Where it is stored

```
data/playthroughs/<id>.json     one file per playthrough — a timeline branch is its own
                                file, linked to the root by branchId / parentBranchId
```

Records are validated on load, and newer fields are filled in with defaults rather than
rejected, so a playthrough written by an older build still opens. When a persisted shape
changes, a versioned migration step maps the old shape onto the new one instead of discarding
the file.
