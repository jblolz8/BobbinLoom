# Prompt Architecture

How a single game turn becomes a request to the text provider: the message layout, what goes in each slot, and how the token budget decides how much chat history is sent.

Source of truth: `src/server/provider/promptBuilder.ts` (`assembleTurnPrompt`), `src/server/openAiCompatibleProvider.ts` (`generateTurn`), `src/server/turnActions.ts` (`executeTurn`).

---

## The message array

A turn is sent as a real multi-turn chat array, not a flattened blob:

```
[system]    preset modules  +  lorebook entries at position 0 ("before")
[user]      real player turn                    ┐
[assistant] real narrative turn                 │  token-budgeted window of the
   …                                            │  current chapter's visible
[user]      real player turn                    ┘  messages, newest last
[system]    memories + STORY SO FAR + CURRENT STATE
            + PARSED INPUT + lorebook depth + lorebook position 1 ("after")
            + OUTPUT FORMAT / statePatch contract
[user]      the player's raw input for this turn
```

Design rationale, in order of precedence:

1. **The stable prefix is first and never changes.** Preset modules and lorebook `before` entries sit at index 0 so providers with prefix caching can cache that block *and* the append-only transcript behind it.
2. **The transcript is real role messages.** The model sees its own prior turns as `assistant` turns rather than quoted prose inside a `user` message. This is what makes instruction-following and role alternation work; it is also what lets SillyTavern-style World Info positions map onto actual message slots.
3. **Everything volatile sits at the tail.** Memories, story-so-far, world state, and the output contract all change every turn, so they go in one `system` message immediately before the final user turn — close to generation for instruction adherence, and after the cacheable region so they never invalidate it.

### The no-history path

When there is no transcript to send — a fresh playthrough, or immediately after closing a chapter, because archived messages are `hidden` — the tail block is **merged into the leading `system` message**, producing exactly `[system, user]`. This exists so the array never opens with two consecutive `system` messages, which some local runtimes reject or silently merge.

---

## Where each segment comes from

| Segment | Source | Position |
|---|---|---|
| Preset modules | `state.promptSettings.modules.turn`, enabled + sorted by `order` | leading `system` |
| Lorebook position 0 | `scanLorebooks()`, entries with `position === 0` | leading `system` |
| Chat transcript | `state.messages.filter(m => !m.hidden)` | middle, as real turns |
| Relevant memories | `retrieveMemoriesVector(state, queryEmbedding)` | tail `system` |
| STORY SO FAR | latest `storyMetaSummaries` + up to `VERBATIM_CHAPTER_LIMIT` uncompacted chapters | tail `system` |
| CURRENT STATE | `summarizePlaythrough(state)` | tail `system` |
| Lorebook depth | entries with `position >= 2`, sorted by depth then order | tail `system` |
| Lorebook position 1 | entries with `position === 1` ("after") | tail `system` |
| Output contract | `buildOutputContract(choicesEnabled, format)` | tail `system`, last |
| Current input | `input.raw` | final `user` |

`PARSED INPUT` (the action/spoken split) lives in the tail `system` message rather than the final user message, so the final message stays the player's verbatim words — which matters for edit and retry fidelity.

### What is never sent

`hidden` means "not part of the outgoing prompt". Two things set it:

- **Chapter archiving** — `closeChapterAction` sets `hidden = true` and tags `chapterId`, so an archived chapter reaches the model only through STORY SO FAR.
- **Synthetic user messages** — the chapter-opening instruction and the "Continue" flow's continuation instruction are recorded `hidden` so `retryAssistantTurn` can still find a preceding user message and its snapshot.

There is **no count-based ghosting**. History size is governed by the token budget below, never by a message count.

---

## The token budget

```
usable        = contextWindow − reserveOutputTokens − CONTEXT_SAFETY_RESERVE
fixedCost     = tokens(stable block) + tokens(tail block) + tokens(raw input)
historyBudget = max(0, usable − fixedCost)
```

If `fixedCost` alone exceeds `usable`, `historyBudget` floors at 0 and `MIN_HISTORY_MESSAGES = 2` still guarantees the newest exchange is sent. Dropping the immediately preceding turn would leave the model with no immediate context at all, which is worse than a slightly oversized prompt.

`reserveOutputTokens` is the connection's `maxTokens` (the same value sent as `max_tokens`), so a prompt that fills the window can still produce a completion. Without this reservation a full prompt yields `finish_reason: "length"` truncation.

| Constant | Value | Meaning |
|---|---|---|
| `CONTEXT_SAFETY_RESERVE` | 512 | chat-template framing, role markers, estimator drift |
| `MIN_HISTORY_MESSAGES` | 2 | always-send floor |
| `PROMPT_MESSAGE_OVERHEAD_TOKENS` | 4 | per-message role/separator cost |

`contextWindow` and `maxTokens` come from the **connection** (`providerManager.getContextWindow()` / `getMaxTokens()`), not from the preset defaults. `ProviderManager` falls back to 32768 when a connection has no configured window.

**`contextWindow` ≠ `maxTokens` — never conflate them.** `maxTokens` is the output cap sent to the API; `contextWindow` is total prompt capacity and the meter's denominator.

### History selection

`selectHistory(state, budgetTokens)` walks visible messages from the newest backwards, keeping whole messages while they fit, and returns them oldest-first. Characteristics worth knowing:

- Selection is by token budget only. Chapter boundaries are not respected — a window can start mid-chapter.
- The remainder is reported as `droppedHistoryChars`, which is currently **not surfaced in the UI**. The hook exists so a future meter segment can show "history not sent" and make closing a chapter an informed choice.
- Because archived messages are `hidden` and excluded here, the transcript is always the current chapter's messages. Older material reaches the model as STORY SO FAR, not as raw turns.

---

## Measuring: estimate vs measured

Two numbers describe the same prompt:

- **`promptUsage.estimated`** — `chars/4` per segment, summed. Always present. Used by the meter's fallback and by the calibration ratio below.
- **`TokenUsage.measured`** — the provider's real `usage.prompt_tokens` / `completion_tokens`, when the endpoint reports them. Absent on many local runtimes and always absent on `MockProvider`.

The meter prefers `measured` and shows a `· measured` suffix; `deriveMeterTotals` scales each breakdown segment by `measured / estimated` so the bar still tiles to the label it prints. Real usage only exists after a turn has run, so the estimate covers load time and the first turn.

### The estimator under-reports punctuation-dense prompts

`chars/4` assumes ~4 characters per token, which holds for English prose and fails badly for this prompt. The OUTPUT FORMAT contract is ~10K characters of JSON punctuation plus emoji-bearing examples, which tokenizes at roughly 2.5–3 chars/token. Measured on a representative prompt: **estimate 4218 vs real 7421 — a 1.76× under-report**, concentrated in the segment that dominates the prompt.

This matters because the budget is computed from the estimate: an 8192-token connection with 1200 reserved output believes a 4218-token prompt fits in 6480 usable tokens while the real request is 7421 and overflows the window.

### Self-calibration

The budget corrects itself from measured usage. After every turn that reports `usage`, `executeTurn` stores the ratio on the playthrough:

```
state.tokenCalibration = clampCalibration(measured.promptTokens / promptUsage.estimated)
```

`generateTurn` and both meter routes pass it back in as `PromptBudget.calibration`, where it scales the budget maths only.

`clampCalibration` clamps to `[MIN_TOKEN_CALIBRATION, MAX_TOKEN_CALIBRATION]` = `[1, 4]` and returns 1 for a missing or non-finite value.

**The floor of 1 is deliberate.** `chars/4` is treated as a *lower bound* on true size. A model that appears to tokenize more efficiently than `chars/4` must never be used as an excuse to pack more history in: over-admitting risks a provider error or silent truncation, while under-admitting only costs a little context.

**The reported `breakdown` / `estimated` must stay on the unscaled basis.** The ratio's denominator is `promptUsage.estimated`; scaling the breakdown too would make `estimated` converge on `measured`, so the next turn's ratio would decay toward 1 and the correction would silently switch itself off. Scale only the budget maths — `fixedCost` and `selectHistory`'s per-message cost.

`tokenCalibration` is **deliberately not part of `TurnSnapshot`**. It measures the connection's tokenizer, not world state, and a retry must not rewind it to a staler ratio.

Verified on an 8192-token connection with 1200 reserved: uncalibrated the prompt admitted 30 history messages whose real cost (7779) exceeded the 6480 usable budget; calibrated it admitted 18 and fit.

---

## Memory retrieval is relevance-selected

`retrieveMemoriesVector(state, queryEmbedding)` merges all three memory layers (`memoryEvents`, `memoryLayers.recent`, `memoryLayers.compressed`), deduped by id, and scores every event:

```
importance * 3
  + 8  if it belongs to a character currently in the cast
  + 6  per tag matching a current character name
  + 5  if a tag equals the CURRENT LOCATION
  + 4  per matching quest id or flag
  + min(turn / 5, 5)                      recency
  + cosineSimilarity(queryEmbedding, event.embedding) * 10
```

The highest-scoring events win until the budget is exhausted. The query embedding is built from the **last 4 visible messages**.

Consequences:

- Selection changes every turn. It is keyword-heavy against *current* state, so the memory block is volatile by construction and belongs in the tail.
- Only a few events fit. `MEMORY_RETRIEVAL_BUDGET = 800` is charged as `wordCount * 4 + 10` per event — an estimate in *characters* compared against a number named "budget", so the effective ceiling is roughly a third of what it reads as: measured, **4 events out of 40 stored** (~270 real tokens). See the open item in the reshape plan about rescaling this.
- Older chapters reach the model mainly through STORY SO FAR, not through this list. If a beat must survive, it belongs in a chapter summary.
- The candidate pool is bounded by `rotateMemoryEvents` (`MEMORY_ROTATION_THRESHOLD = 60` live events, compressed layer capped at 50), so the oldest events are eventually dropped from retrieval.

Both meter routes must build the same query embedding `generateTurn` does, or the meter reports a selection that is never sent. `embedTexts` returns `[]` on failure, which degrades to keyword-only scoring — that must never turn a read-only meter request into an error.

---

## Debugging a prompt

The **Debug** panel in the chat view:

- **Input** — the raw request body. This is the authoritative view of what was sent: check the role sequence, that the tail `system` message is second-to-last, and that the final message is the player's input.
- **Output** — the raw response body, including `finish_reason` and `usage`.
- **Info** — `tokenUsage` (estimate, measured, per-segment breakdown), cast presence, memory layer counts, and message counts.
- **Patch** — which `statePatch` operations were applied or rejected.

---

## Invariants to preserve

- **`hidden` gates the prompt, not just the UI.** Anything newly hidden disappears from the transcript *and* from chapter archiving (`stateActions.ts` archives `!m.hidden && !m.chapterId`). Hiding a message without a `chapterId` makes it unarchivable and invisible to the player — that is exactly the bug count-based ghosting caused, and why it was removed.
- **The 12-message history cap is gone.** History size is a token budget now; any code, comment, or doc still claiming a 12-message transcript limit is stale (the old key was `recentMessages`, renamed to `chatHistory`).
- **A bigger window must not resurrect ghosting.** Retaining messages in `state.messages` is cheap; what gets *sent* is the budget's job.
