---
title: Timelines
section: Playing
order: 40
---

# Timelines

Any message can be the start of a different story. **Branch** from a message and BobbinLoom
creates a new playthrough that shares the original's history up to that point and then goes its
own way, leaving the original untouched.

## Branching

Branching from a message restores the world to its state at that moment — the branch reverts to
the nearest saved checkpoint at or before the message, so it starts from real historical state
rather than whatever the world looks like now. Everything after that point is dropped from the
branch, while the original keeps its full history.

The branch gets its own id and its own branch identity, and every part of the world that is
scoped to a branch is re-keyed so the two stories cannot bleed into each other: characters,
memory events and memory layers all move to the new branch. The characters' sheets, the
inventory, the quests and the locations come from the checkpoint.

A branch is a full playthrough in its own right — it lives in `data/playthroughs/` alongside
the original, and it can be retried, closed into chapters, duplicated and branched again.

## A branch, or a separate story

Branches come in two flavours:

| Kind | Behaviour |
|---|---|
| **Internal timeline** | The branch belongs to the original's timeline. It's reachable from the timeline viewer and stays out of your main playthrough list |
| **Standalone playthrough** | The branch also appears as its own entry in the playthrough list and in save/load |

Every internal branch can be promoted to standalone from the timeline viewer, and the choice is
a toggle rather than something fixed at creation.

## The timeline viewer

**Timelines** in the playthrough's actions menu opens the viewer for the story you're in. It
shows the family as a tree: the root playthrough and each branch hanging off the point it
forks from, labelled with the turn it starts from and the message it split on.

From there you can:

- switch to any branch and keep playing it
- rename a branch
- promote an internal branch to a standalone playthrough, or fold it back in
- delete a branch

Deleting a branch is not the same as deleting the story: branches are separate files, so the
one you delete is removed and the rest of the timeline stays as it was.
