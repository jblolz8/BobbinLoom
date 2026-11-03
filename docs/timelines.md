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
inventory and the quests come from the checkpoint.

A branch is a full playthrough in its own right — it lives in `data/playthroughs/` alongside
the original, and it can be retried, closed into chapters, duplicated and branched again.

## Organizing timelines on the playthrough shelf

The playthrough shelf toolbar includes a lineage filter with three modes, remembered per device:

| Mode | What it shows |
|---|---|
| **Parents** | Root playthroughs only, keeping your main shelf clean while surfacing each family's timeline count badge |
| **Grouped** | Each root playthrough paired with its child timeline branches nested inside a visual family group container |
| **Branches** | Child timeline branches only, each showing which parent and turn it forked from |

When sorting by **Updated Date** in **Parents** or **Grouped** mode, playing or updating any child
timeline branch automatically bumps its parent family to the top of the shelf and displays the
latest family activity date on the parent card.

Playthroughs with timeline branches also display a **Timelines** action button and a **Timelines
count badge**:

- **Hovering the badge** opens an interactive quick-switch popover listing every branch in the
  family for one-click loading, plus a **View Graph** shortcut.
- **Clicking the badge or the Timelines button** opens the full Timeline Tree Graph viewer directly
  from the shelf.
- Playthroughs without branches hide the badge and button automatically.

## The timeline tree graph viewer

You can open **Timelines & Branches** from the playthrough shelf, from the play view's top
toolbar, from **Scene Overview**, or from **View Timelines** in the **Journal** tab.

The viewer renders the entire story family as an interactive hierarchy graph:

- **Orientation toggle:** Switch between **Left → Right** and **Top → Bottom** tree layouts
  (automatically defaulting to **Top → Bottom** on narrow mobile screens).
- **Active lineage path:** The path from the root playthrough to your currently active timeline is
  highlighted with animated connectors.
- **Pan, zoom & fit:** Drag the canvas (or use one-finger touch pan and two-finger pinch-to-zoom
  on mobile), scroll to zoom at crisp native layout resolution, or click **Fit tree to view** to
  re-center the tree.
- **Selected timeline inspector:** Clicking any node inspects its turn, message/chapter/cast
  counts, two-line latest message preview, clickable parent lineage chip, and actions to **Load**,
  **Rename**, or **Delete** that timeline.

## Deleting a timeline vs. a timeline family

When you delete a playthrough that has child timeline branches, the confirmation dialog lets you
choose between:

- **Delete This Timeline Only (default):** Deletes only the selected timeline and automatically
  promotes its earliest child branch to become the new root (or re-parents sub-branches to the
  parent timeline), ensuring surviving branches are never orphaned.
- **Delete Entire Timeline Family:** Deletes the root playthrough and every timeline branch in its
  family together.
