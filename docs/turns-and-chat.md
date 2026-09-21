---
title: Turns & the chat surface
section: Playing
order: 20
---

# Turns & the chat surface

The chat is the game. You write what your character does or says, the model narrates the
world's response, and the engine folds any state changes the model proposed back into the
playthrough.

## Sending a turn

Your message appears immediately as an optimistic bubble while the response generates below
it. The Send button becomes a red **Cancel** for the duration; cancelling restores your text
and marks the turn as cancelled rather than failing it.

A turn sends the assembled prompt (see [Prompt architecture](prompt-architecture.md)), applies
whatever state patches the model returned, records the response, refreshes the context meter
and stores a snapshot of the state as it was before the turn.

## Message actions

Every message carries a timestamp, and an `(edited)` tag once it has been changed. Assistant
messages also show how long they took to generate and which model produced them.

| Action | Where | What it does |
|---|---|---|
| **Edit** | any message | Opens an inline editor; saving updates the message in place |
| **Retry** | assistant messages | Discards that response and everything after it, rewinds the world to before that turn, and generates a fresh response from the same input. It confirms first, naming what will be lost |
| **Revert** | assistant responses in an archived transcript | Turns the story back to that response: it and everything after it are discarded, the chapter becomes the running chapter again and its summary is discarded. Nothing is regenerated |
| **Truncate** | any message | Confirms, then cuts the chat back to just before that message, discarding everything after it |
| **Branch** | any message | Starts a timeline branch from that point — see [Timelines](timelines.md) |

Because every turn stores its own snapshot, Retry is a real revert: the world state, the cast,
the inventory and the chapter data all roll back with the message, not just the text. Anything you
wrote after that turn goes with it — which is why the confirmation names the messages, turns and
images it will take, and offers **Duplicate as backup** before you commit to it.

The turn then runs in the chat the way a send does: the composer locks, its **Cancel** stops it, and
the rest of the play view stays usable. **Nothing is written until the new response arrives**, so a
failed or a cancelled retry leaves the story exactly as it is; while it waits, the response being
replaced is dimmed and the messages that will go with it are marked, under one line saying how many.
When the story has no restore point for that turn the dialog says so: the messages go, and the new
response is written against the world as it stands now rather than as it was.

A retried turn keeps its character: a chapter opening stays a chapter opening, a hidden
instruction stays hidden.

The **opening message** you can write when closing a chapter (see
[Chapters & memory](chapters-and-memory.md)) is an ordinary user message: editable like any other,
and a **Retry** on the chapter's opening re-generates that opening with it still in play.

## Suggested choices

When enabled, each response can be followed by a short row of suggested next actions. Clicking
one sends it as your turn. The row only appears when choices were actually produced, and the
toggle lives in the chat's input area.

## Images in chat

Images can be generated for any message and are stored with it. Each one keeps its prompt, the
provider and model that made it, and its seed.

From the chat you can:

- generate an image for a message, optionally editing the prompt first in the image prompt modal
- open any image in the viewer, or compare an image against its alternatives side by side
- delete a single image, or sweep the ones nothing references any more from
  Settings → Provider → image storage

Prompt construction, the provider dialects and the storage layout are covered in
[Image generation](image-generation.md).

## How messages render

Message text goes through the app's own markdown renderer: paragraphs, bullet and numbered
lists, fenced code, blockquotes, bold/italic and inline code. Quoted dialogue — straight or
curly quotes — gets its own accent styling, so speech reads differently from narration.

The renderer is deliberately self-contained: no markdown dependency, and dialogue handling is
part of the parser rather than a post-processing pass.

## The debug box

When the debug panel is enabled for the chat, each turn exposes three tabs:

| Tab | Shows |
|---|---|
| **Patch** | The state changes the model asked for — which were applied, which were rejected, and any warnings |
| **Output** | The raw response the provider returned |
| **Input** | The message array that was actually sent |

Patch results are surfaced here and to you only. They are not fed back to the model on later
turns — the prompt teaches the model the valid shapes up front instead, so a rejected action
does not turn into a retry loop.

## The context meter

Below the input sits a stacked bar showing how the next prompt divides up against the model's
context window. Each segment can be hovered or clicked for its token count: modules, output
format, lorebook, Story So Far, state summary, chat history, memory events, lorebook depth and
your input.

The meter is measured from a real assembly of the prompt with your input empty — it costs no
model call. How the segments are built and budgeted is in
[Prompt architecture](prompt-architecture.md).
