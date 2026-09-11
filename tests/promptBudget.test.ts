import { describe, expect, it } from "vitest";
import { createInitialPlaythrough, parseUserInput } from "../src/engine/engine";
import { assembleTurnPrompt, selectHistory, PROMPT_MESSAGE_OVERHEAD_TOKENS, MIN_HISTORY_MESSAGES } from "../src/server/provider/promptBuilder";

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

describe("assembleTurnPrompt message array", () => {
  const budget = { contextWindow: 65536, reserveOutputTokens: 1200 };

  it("emits a real transcript with alternating roles and ends on the user turn", () => {
    const pt = withHistory(4, 200);
    const { messages } = assembleTurnPrompt(parseUserInput("I look around."), pt, true, [], budget);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2].role).toBe("assistant");
    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toContain("I look around.");
    // at least the last exchange is really present as its own messages
    expect(messages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("puts the volatile block in a tail system message before the final user turn", () => {
    const pt = withHistory(2, 200);
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget);
    const tail = messages[messages.length - 2];
    expect(tail.role).toBe("system");
    expect(tail.content).toContain("CURRENT STATE");
    expect(tail.content).toContain("OUTPUT FORMAT");
    expect(messages[0].content).not.toContain("OUTPUT FORMAT");
  });

  it("merges the tail block into the leading system message when there is no history", () => {
    const pt = createInitialPlaythrough("Empty");
    pt.messages = [];
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("OUTPUT FORMAT");
    expect(messages[1].role).toBe("user");
  });

  it("never sends two leading system messages", () => {
    const pt = createInitialPlaythrough("Archived");
    pt.messages = [
      { id: "m1", role: "user", content: "old", createdAt: "2026-01-01T00:00:00.000Z", hidden: true, chapterId: "ch_1" },
      { id: "m2", role: "assistant", content: "old reply", createdAt: "2026-01-01T00:00:00.000Z", hidden: true, chapterId: "ch_1" }
    ];
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("keeps chatHistory segments off the wire when nothing fits", () => {
    const pt = withHistory(30, 8000);
    const { messages, promptUsage } = assembleTurnPrompt(
      parseUserInput("go"), pt, true, [],
      { contextWindow: 4096, reserveOutputTokens: 1200 }
    );
    expect(promptUsage.breakdown.chatHistory).toBeGreaterThan(0);
    expect(messages.length).toBeLessThan(30);
  });

  it("reports dropped history characters for the excluded tail of the transcript", () => {
    const pt = withHistory(4, 400);
    const { messages, droppedHistoryChars } = assembleTurnPrompt(
      parseUserInput("go"), pt, true, [],
      { contextWindow: 3000, reserveOutputTokens: 1200 }
    );
    // History is truncated, so some visible characters never reach the wire.
    expect(droppedHistoryChars).toBeGreaterThan(0);
    // The dropped count belongs to messages that are genuinely absent.
    const sentHistoryChars = messages
      .filter((m) => m.role !== "system" && m.content !== "go")
      .reduce((n, m) => n + m.content.length, 0);
    expect(sentHistoryChars + droppedHistoryChars).toBe(8 * 400);
  });

  it("charges the stable block at index 0 and the transcript between it and the tail", () => {
    const pt = withHistory(2, 200);
    // A preset module proves the stable prefix is its own leading message.
    pt.promptSettings = {
      presetId: "test",
      presetName: "Test",
      modules: {
        turn: [{
          id: "mod_stable",
          name: "Stable module",
          description: "stable",
          content: "STABLE PREFIX MARKER",
          order: 1,
          enabled: true
        }]
      }
    };
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("STABLE PREFIX MARKER");
    expect(messages[0].content).not.toContain("CURRENT STATE");
    // Every transcript message sits strictly between the two system messages.
    const firstAssistant = messages.findIndex((m) => m.role === "assistant");
    const lastSystem = messages.map((m) => m.role).lastIndexOf("system");
    expect(firstAssistant).toBeGreaterThan(0);
    expect(firstAssistant).toBeLessThan(lastSystem);
  });
});
