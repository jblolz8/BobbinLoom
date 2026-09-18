---
title: Playthroughs
section: Playing
order: 10
---

# Playthroughs

A playthrough is one story: its world, its cast, its chat history and its save points. The app
opens on the home screen, which lists every playthrough you have.

## The playthrough shelf

Each item shows a cover image, the playthrough's name, its current location, turn count, cast
size, when it was last touched, and a two-line preview of the most recent message. The **⋮**
menu offers **Rename**, **Duplicate** and **Delete**.

Two view modes, switched by the toolbar's **Grid** / **List** buttons and remembered per device:
**Grid** shows the cover as a wide banner above the text, **List** shows it as a small thumbnail
beside the title. **Search** matches the name and the location, the sort control orders by
updated date, name or turn, and the pager keeps a page size of its own.

The whole shelf — search, sort, view modes, pager, the **⋮** menu — is also inside the play view,
behind **Save / Load** in its header, where picking an item switches to that story. It is the
same shelf in both places, so an item behaves identically wherever it is rendered.

## Cover art

A playthrough wears the first of these that exists:

| Priority | Source | When it applies |
|---|---|---|
| 1 | **A picture you picked** | Chosen by hand in **Gallery Media** |
| 2 | **The latest image** | The newest image generated anywhere in the story so far |
| 3 | **The present cast** | No images yet: a collage of the characters at your current location, in cast order — up to four, with a **+N** count for the rest |
| 4 | **The placeholder** | Nothing to show — the monochrome BobbinLoom mark |

An image is fitted whole over a blurred fill of itself, so a portrait or a square render never
sits on black bars. A picture you picked can instead **Fill** the frame and let the edges fall
off it.

**Gallery Media** — in the play view's Journal tab, under **Media** — lists every image the
story has produced, newest first, each with the chapter and turn it came from. **Use as cover**
sets the pick, **Fill** sets it in fill mode, and **Clear custom cover** hands the item back to
the automatic chain. Removing an image that happens to be the cover asks first and says so, and
the cover then falls back to the next source.

Covers are library metadata, not story state: changing one is never recorded as play, and it is
not part of a snapshot. A duplicated playthrough or a timeline branch starts with the same
cover, because the field travels with the document.

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
