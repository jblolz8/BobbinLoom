---
title: World state
section: World
order: 50
---

# World state

The engine keeps the world as data: quests, items, flags, and the cast's own
tracked state. The model proposes changes to it every turn, and every change goes through the
same patch pipeline — the engine applies what it can, records what it refused, and shows both
to you in the chat's debug panel.

## World state

World state is a flat list of `{ id, name, description }` objects. 

- **The model** adds states to represent ongoing active conditions in the world (e.g. "🌧️ Heavy Rain", "🚨 Town on Alert"). It is instructed to rigorously issue a removal (`worldStateRemove`) when a condition resolves to prevent clutter, rather than using it as an event timeline.
- **You** control the list from the scene panel to edit, delete, or add states.

State changes are silent by design: the model already receives the full world state list in every
turn's state summary, so there is nothing to announce.

## Inventory and items

Items live in a catalog on the playthrough; the inventory is a list of references to catalog
items with a quantity. The model can introduce new items as they appear in the story
(a weapon rusts, a potion gets identified) and add, remove or update them.

Item type is free-form text, not a fixed set of categories: whatever word describes the thing
is what gets stored, and unknown types simply fall back to a generic icon. Names render as the
catalog name, never as the raw id.

## Character flags and conditions

Three separate trackers, all of them plain lists of strings:

| Tracker | Scope |
|---|---|
| `playerCharacter.flags` / `.conditions` | Your own lasting marks |
| `characters[].flags` / `.conditions` | Per-character marks |

The model writes them as short human-readable, emoji-prefixed names (`🗝️ Knows the Password`), so both the interface and the model read the same string with no id-to-label step.

## The cast in play

Detailed characters carry their own state alongside their sheet: mood, attitude toward you, a
memory summary, structured clothing, conditions, and flags. All of it
is patched through the same op pipeline, and all of it appears in the character sheet editor
and the Chars tab.

### Presence

The detail a character is given in the prompt depends on whether they are in the scene:

- characters active in the current scene are described in full, with their sheet
- characters elsewhere appear as one-liners under an absent heading
- background characters are a single roster line each

Being absent never blocks anything: you can still edit an absent character's sheet and patch their state normally. Presence only decides how much of them the model is shown.

### Background characters

Simple characters are `{ name, description, disposition }` — a one-word
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
never named in the messages, never tagged in a memory event, and was never active in a scene,
they fade out and a short system line records that they did.
