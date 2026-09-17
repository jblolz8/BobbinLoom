---
title: World state
section: World
order: 50
---

# World state

The engine keeps the world as data: locations, quests, items, flags, and the cast's own
tracked state. The model proposes changes to it every turn, and every change goes through the
same patch pipeline — the engine applies what it can, records what it refused, and shows both
to you in the chat's debug panel.

## Locations and the map

A location is `{ id, name, description, state, icon, connections, x, y }`:

- **`description` is the stable identity** of a place — what it is, physically
- **`state` is the dynamic part** — what has changed about it, who is there, what it looks
  like now
- **`connections`** are stored in both directions; connecting two places updates both entries
- **`x` / `y`** position the place on the map and are assigned automatically

The map itself is drawn in the scene panel as a MiniMap of the places around you.

The model manages the graph: adding locations, updating them, connecting and disconnecting
them. Two rules keep it coherent:

- **Name-similar additions are refused.** Adding a location whose name closely matches one that
  already exists rejects with a pointer to the existing id, so the catalog doesn't fill up with
  near-duplicates of the same town.
- **Connections are advisory, travel is not.** Adding a location with a connection to an
  unknown id warns instead of failing, and the move still happens for characters. The player is
  the exception: **the player's journey must be a real route**. Direct neighbours need no extra
  fields; for anything multi-hop, the travel op carries the ordered intermediate stops, and
  every consecutive hop has to be an existing connection or the whole journey is refused.

What the model knows about the map each turn is layered: where you are, the neighbours, the
full location roster, and a `REACHABLE` list of everything within two hops. Cost therefore
scales with how well connected a place is, not with how big the world has grown.

## Quests

Quests are a flat list: `{ name, summary, tracking, status }`, where status is active,
completed or failed. There are no objectives or hidden prerequisites.

- **The model** adds quests as they arise and updates them as they progress, complete or become
  impossible.
- **You** control the list from the scene panel: tick a quest to track it, edit its name and
  summary, or delete it outright.

A quest shows in the scene panel when it is tracked **or** still active — completed and failed
quests stay visible only if you kept them tracked, and unticking one removes it.

Quest changes are silent by design: the model already receives the full quest list in every
turn's state summary, so there is nothing to announce.

## Inventory and items

Items live in a catalog on the playthrough; the inventory is a list of references to catalog
items with a quantity. The model can introduce new items as they appear in the story
(a weapon rusts, a potion gets identified) and add, remove or update them.

Item type is free-form text, not a fixed set of categories: whatever word describes the thing
is what gets stored, and unknown types simply fall back to a generic icon. Names render as the
catalog name, never as the raw id.

## Flags and conditions

Four separate trackers, all of them plain lists of strings:

| Tracker | Scope |
|---|---|
| `flags` | The world — things that became true |
| `playerCharacter.flags` / `.conditions` | Your own lasting marks |
| `characters[].flags` / `.conditions` | Per-character marks |

The model writes them as short human-readable, emoji-prefixed names (`💢 Slime Encounter
Started`), so both the interface and the model read the same string with no id-to-label step.

## The cast in play

Detailed characters carry their own state alongside their sheet: mood, attitude toward you, a
memory summary, structured clothing, conditions, flags, and where they currently are. All of it
is patched through the same op pipeline, and all of it appears in the character sheet editor
and the Chars tab.

### Presence

The detail a character is given in the prompt depends on whether they are in the scene:

- characters in your current location are described in full, with their sheet
- characters elsewhere appear as one-liners under an absent heading
- background characters are a single roster line each

Being absent never blocks anything: you can still edit an absent character's sheet, move them,
and patch their state normally. Presence only decides how much of them the model is shown.

### Background characters

Simple characters are `{ name, description, disposition, locationId }` — a one-word
disposition and a one-line description, enough to populate a scene without a full sheet.

They can be promoted to the main cast in two ways:

| Path | How it works |
|---|---|
| **The model decides** | During a turn, it promotes a background character who has become genuinely important. The new sheet is built immediately from their description and disposition, with no extra model call |
| **You decide** | The Chars tab's promote action writes a full character sheet with the model, and shows you the result before it joins the cast |

A promoted character gets a sheet local to the playthrough. Nothing is written to your character
library unless you save it there yourself — see
[Character library](character-library.md).

Closing a chapter prunes background characters that the chapter never used: if a character was
never named in the messages, never tagged in a memory event, and was never at a place you
visited, they fade out and a short system line records that they did.
