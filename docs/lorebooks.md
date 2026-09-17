---
title: Lorebooks
section: World
order: 55
---

# Lorebooks

A lorebook is reference material the model is given only when it is relevant. Entries sit in a
file, each one keyed to words; when those words appear in the recent conversation, the entry's
text is inserted into the turn's prompt. It's how a setting's rules, places and history get to
the model without living in every prompt forever.

Lorebooks use SillyTavern's World Info format, so a file you already have imports as-is.

## Storage and attachment

```
data/lorebooks/<id>.json    one file per lorebook
```

A playthrough references lorebooks **by id** rather than copying them. Editing a lorebook
therefore affects every playthrough using it, immediately, and the same book can back several
stories. Which books a playthrough uses is chosen at setup and stored on the playthrough.

## Entry fields

| Field | What it does |
|---|---|
| `key` | The trigger words. Any one of them matching activates the entry |
| `keysecondary` | A second set of words, used only with `selective` |
| `selective` | Requires the secondary keys to also pass before the entry activates |
| `selectiveLogic` | How the secondary set is judged: 0 any, 1 not all, 2 none, 3 all |
| `content` | The text inserted into the prompt |
| `constant` | Always active, regardless of keywords |
| `order` | Activation and injection priority — lower goes first |
| `position` | Where the entry lands: 0 before the transcript, 1 just before your turn, 2+ at a depth from the bottom |
| `depth` | For position 2 and above, how far up from the latest message to inject |
| `scanDepth` | How many recent messages to search (overrides the file's default) |
| `caseSensitive`, `matchWholeWords`, `useRegex` | How the keys are matched |
| `useProbability`, `probability` | Give the entry a chance of activating rather than a certainty |
| `disable` | Switches the entry off without deleting it |
| `sticky` | Keeps the entry active for a number of turns after it last matched |
| `cooldown` | Turns it must stay inactive after firing |
| `delay` | Turns to wait before it can activate at all |

The remaining World Info fields are preserved on import, so an imported file round-trips
unchanged.

## How an entry activates

Every turn, the playthrough's lorebooks are scanned in a fixed order:

1. entries with `disable` are dropped, and the rest are sorted by `order`
2. an entry already sticky from a previous turn activates straight away
3. `constant` entries activate without any keyword
4. keyword entries activate when a primary key matches the scanned messages — and, if
   `selective` is on, when the secondary keys pass their logic
5. an entry with probability enabled rolls against its own percentage

The scanned text is the most recent `scanDepth` messages, per entry or per file, with the
case-sensitivity, whole-word and regex options applied.

Sticky, cooldown and delay are tracked per playthrough, in turn terms: after each turn the
lorebooks are re-scanned against the new conversation and those timers are updated. Retrying a
turn re-derives them from the re-scan rather than restoring a stored value.

## Where it lands in the prompt

Activated entries are grouped by their configured position and placed accordingly: the
before-the-transcript group near the top, the just-before-your-turn group at the tail, and the
deeper ones inserted partway up the message list, ordered by depth and then by order.

The context meter reports lorebook content as its own segments, so you can see what a book is
costing on any given turn.

## Lorebooks and scenario generation

Lorebooks also feed new stories. When generating a scenario, the attached books' constant
entries and the entries whose keys appear in your premise are given to the model, within their
own share of the budget, so a generated world starts consistent with what the lorebook already
says about it.

## Importing

Import a SillyTavern World Info JSON file and it becomes a lorebook you can attach to any
playthrough. The library's lorebook surface handles creating, editing, importing and deleting
them, and shows each book's entry count.
