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

Trackers for ongoing physical, mental, or narrative states:

| Tracker | Scope |
|---|---|
| `playerCharacter.conditions` | Player status conditions (e.g. `🤕 Wounded`, `😴 Exhausted`) |
| `playerCharacter.flags` | Player-specific narrative flags and knowledge (e.g. `🗝️ Knows the Password`) |
| `characters[].conditions` | Per-character status conditions |
| `characters[].flags` | Per-character narrative flags |

The model writes them as short, human-readable, emoji-prefixed names (`🤕 Sprained Ankle`, `🗝️ Knows the Password`).

### Patch lifecycle & resilient matching

Conditions and flags have a complete lifecycle in the engine:
- **Add & Remove**: `playerConditionsAdd` / `Remove`, `characterConditionsAdd` / `Remove`, `playerFlagsAdd` / `Remove`, `characterFlagsAdd` / `Remove`.
- **Replace / Update**: `playerConditionsReplace` and `characterConditionsReplace` allow the model to transition evolving conditions (e.g. `{ from: "Bleeding", to: "🩹 Bandaged" }`) in a single patch without piling up obsolete entries.
- **Resilient matching**: Removals strip emojis, normalize whitespace, match case-insensitively, and convert `snake_case` underscores to spaces. If a condition is stored as `"🤕 Severely Bleeding"`, an AI removal of `["severely bleeding"]` or `["bleeding"]` cleanly matches and removes it.
- **Model cleanup mandate**: The model is instructed to remove temporary injuries, exhaustion, or passing flags when resolved, preventing status clutter.
- **Manual control in play**: You have direct control over conditions and flags. In the **Player** tab, you can add, click-to-edit, or delete (`×`) player conditions and flags anytime. In the **Chars** tab, every condition and flag chip on character cards features an instant delete (`×`) button.

## The cast in play

Detailed characters carry their own state alongside their sheet: mood, attitude toward you, a
memory summary, structured clothing, conditions, and flags. All of it
is patched through the same op pipeline, and all of it appears in the character sheet editor
and the Chars tab.

### Presence

The detail a character is given in the prompt depends on whether they are in the scene:

- characters active in the current scene are described in full, with their sheet
- characters elsewhere appear as one-liners under an absent heading (including their mood, conditions, and flags)
- background characters are a single roster line each

Being absent never blocks anything: you can still edit an absent character's sheet and patch their state normally. Presence only decides how much of them the model is shown.

### Background characters

Simple characters are `{ name, description, storyRole }` — a story role
and a brief description, enough to populate a scene without a full sheet.

- **Manual editing**: You can click **Edit** on any simple character card to adjust their name, description, role, mood, conditions, or flags directly in the Character Editor.
- **Fleshing out**: The **Flesh Out** button uses an AI model to draft a complete character sheet from their description and story history. The specific model used can be selected from the **Flesh-Out Provider** dropdown at the top of the Chars tab, defaulting to your active text connection.

A promoted character gets a sheet local to the playthrough. Nothing is written to your character
library unless you save it there yourself — see
[Character library](character-library.md).

Closing a chapter prunes background characters that the chapter never used: if a character was
never named in the messages, never tagged in a memory event, and was never active in a scene,
they fade out and a short system line records that they did.
