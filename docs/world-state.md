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

- **1-Click Presence Toggle**: On both Detailed and Simple character cards in the Chars tab, clicking the presence badge (`● In Scene` / `○ Off-Screen`) instantly toggles them between active in the scene and off-screen without waiting for an AI model state patch.

### Background characters & Character Manager

Simple characters are `{ name, description, storyRole }` — a story role
and a brief description, enough to populate a scene without a full sheet.

- **Dedicated Simple Character Editor**: Clicking **Edit** on a simple character card opens a dedicated Simple Character Editor modal. Unlike the full sheet editor, this modal is specifically tailored for lightweight cast members:
  - **Identity & Story Role**: Edit Name, narrative Story Role, and physical/personality Description.
  - **Presence & Scene State**: Toggle active scene presence (`In Scene` / `Off-Screen`), current Mood, and stance Toward Player.
  - **Memory Summary**: Edit their continuity summary passed to the prompt.
  - **Conditions & Flags**: Direct tag editing for temporary statuses or narrative flags.
  - **Flesh Out Shortcut**: Built-in callout button to trigger the Character Manager expansion into a full format sheet.
  - **Discard Protection**: Warns and prevents loss of unsaved edits when closing.
- **Fleshing out**: The **Flesh Out** button uses an AI model to draft a complete character sheet from their description and story context. The specific connection used is managed in the **Character Manager** toolbar at the top of the Chars tab, defaulting to your active text connection.
- **Story Context Scope**: You can customize how much story context the Character Manager receives when fleshing out or generating characters:
  - **Current Chapter (All)** (default): Includes complete dialogue, actions, and events from the active chapter.
  - **Timeline Highlights**: Feeds key milestone summaries from the story timeline.
  - **Recent Messages**: Uses the last *N* messages of dialogue (user-configurable count, default 8).
- **Manual Generation**: The **Generate Character** button in the Character Manager toolbar allows you to prompt the AI to invent a brand-new character on the fly:
  - Specify an optional concept or role (e.g. *"A suspicious dockmaster named Orson who recognizes the player"*), or leave it empty to invent someone contextually grounded.
  - Choose between creating a full **Detailed Character** (complete format sheet, personality, and clothing) or a **Simple NPC** note card.
  - Option to place them in the active scene immediately.

A promoted or newly generated character gets a sheet local to the playthrough. Nothing is written to your character
library unless you save it there yourself — see
[Character library](character-library.md).

Closing a chapter prunes background characters that the chapter never used: if a character was
never named in the messages, never tagged in a memory event, and was never active in a scene,
they fade out and a short system line records that they did.
