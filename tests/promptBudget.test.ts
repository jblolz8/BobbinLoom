import { describe, expect, it } from "vitest";
import { createInitialPlaythrough } from "../src/engine/engine";
import { selectHistory, PROMPT_MESSAGE_OVERHEAD_TOKENS, MIN_HISTORY_MESSAGES } from "../src/server/provider/promptBuilder";

/** Builds a playthrough with N user/assistant pairs of `chars` characters each. */
function withHistory(pairs: number, chars = 100) {
  const pt = createInitialPlaythrough("History Test");
  pt.messages = [];
  for (let i = 0; i < pairs; i++) {
    pt.messages.push({ id: `u${i}`, role: "user", content: "u".repeat(chars), createdAt: "2026-01-01T00:00:00.000Z", turn: i });
    pt.messages.push({ id: `a${i}`, role: "assistant", content: "a".repeat(chars), createdAt: "2026-01-01T00:00:00.000Z", turn: i });
  }
  return pt;
}

describe("selectHistory", () => {
  it("keeps the newest messages and drops the oldest when the budget is tight", () => {
    const pt = withHistory(10, 100); // 20 messages, ~29 tokens each
    const { history, droppedChars } = selectHistory(pt, 120);
    expect(history.length).toBeGreaterThanOrEqual(MIN_HISTORY_MESSAGES);
    expect(history.length).toBeLessThan(20);
    expect(history[history.length - 1].content.startsWith("a")).toBe(true); // newest assistant turn
    expect(history[0].content.startsWith("u")).toBe(true);                  // window starts on a user turn
    expect(droppedChars).toBeGreaterThan(0);
  });

  it("keeps everything when the budget is generous", () => {
    const pt = withHistory(3, 100);
    const { history, droppedChars } = selectHistory(pt, 100_000);
    expect(history).toHaveLength(6);
    expect(droppedChars).toBe(0);
  });

  it("always keeps at least MIN_HISTORY_MESSAGES even with a zero budget", () => {
    const pt = withHistory(5, 100);
    const { history } = selectHistory(pt, 0);
    expect(history).toHaveLength(MIN_HISTORY_MESSAGES);
  });

  it("excludes hidden messages (archived chapters, synthetic continue instructions)", () => {
    const pt = withHistory(3, 100);
    pt.messages[pt.messages.length - 1].hidden = true;
    const { history } = selectHistory(pt, 100_000);
    expect(history).toHaveLength(5);
  });

  it("reports dropped characters so the UI can later show what was not sent", () => {
    const pt = withHistory(10, 100);
    const { history, droppedChars } = selectHistory(pt, 100);
    const keptChars = history.reduce((n, m) => n + m.content.length, 0);
    expect(droppedChars).toBe(20 * 100 - keptChars);
  });

  it("charges per-message overhead", () => {
    const pt = withHistory(1, 0); // two empty messages → cost is overhead only
    const { history } = selectHistory(pt, PROMPT_MESSAGE_OVERHEAD_TOKENS * 2 - 1);
    expect(history).toHaveLength(MIN_HISTORY_MESSAGES);
  });
});
