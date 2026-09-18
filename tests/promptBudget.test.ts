import { describe, expect, it } from "vitest";
import { createInitialPlaythrough, parseUserInput, type ActivatedEntry } from "../src/engine/engine";
import { assembleTurnPrompt, selectHistory, clampCalibration, estimateTokens, PROMPT_MESSAGE_OVERHEAD_TOKENS, MIN_HISTORY_MESSAGES, renderLorebookSegments } from "../src/server/provider/promptBuilder";

/** The global prompt config the builder now reads. An empty module set is the
 *  neutral default for tests that do not exercise modules. */
const CFG = { modules: { turn: [] } };

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
    const { messages } = assembleTurnPrompt(parseUserInput("I look around."), pt, true, [], budget, CFG);
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
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
    const tail = messages[messages.length - 2];
    expect(tail.role).toBe("system");
    expect(tail.content).toContain("CURRENT STATE");
    expect(tail.content).toContain("OUTPUT FORMAT");
    expect(messages[0].content).not.toContain("OUTPUT FORMAT");
  });

  it("merges the tail block into the leading system message when there is no history", () => {
    const pt = createInitialPlaythrough("Empty");
    pt.messages = [];
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
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
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("keeps chatHistory segments off the wire when nothing fits", () => {
    const pt = withHistory(30, 8000);
    const { messages, promptUsage } = assembleTurnPrompt(
      parseUserInput("go"), pt, true, [],
      { contextWindow: 4096, reserveOutputTokens: 1200 }, CFG
    );
    expect(promptUsage.breakdown.chatHistory).toBeGreaterThan(0);
    expect(messages.length).toBeLessThan(30);
  });

  it("reports dropped history characters for the excluded tail of the transcript", () => {
    const pt = withHistory(4, 400);
    const { messages, droppedHistoryChars } = assembleTurnPrompt(
      parseUserInput("go"), pt, true, [],
      { contextWindow: 3000, reserveOutputTokens: 1200 }, CFG
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
    // A module proves the stable prefix is its own leading message.
    const config = {
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
    const { messages } = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, config);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("STABLE PREFIX MARKER");
    expect(messages[0].content).not.toContain("CURRENT STATE");
    // Every transcript message sits strictly between the two system messages.
    const firstAssistant = messages.findIndex((m) => m.role === "assistant");
    const lastSystem = messages.map((m) => m.role).lastIndexOf("system");
    expect(firstAssistant).toBeGreaterThan(0);
    expect(firstAssistant).toBeLessThan(lastSystem);
  });

  // Structured clothing is the single source of truth: a BL sheet's [Clothing]
  // section is a generation scaffold and must never reach the prompt — including
  // when the character is wearing nothing, which is a legitimate state and must
  // not leak the raw section (or its "(not established)" stub) into the context.
  it("never injects the raw [Clothing] section for a BL sheet, even with an empty outfit", () => {
    const tpl = {
      id: "tpl_bl", name: "Test Subject", version: 1,
      summary: "A test character.",
      content: "[Species]: Human\n[Gender]: Female\n\n[Clothing]\n(not established) NOISE_CLOTHING_SECTION\n\n[Personality]\n- Watchful.",
      startingClothing: [],
    };
    const pt = createInitialPlaythrough("Clothing Test", undefined, [tpl]);
    expect(pt.characters[0].clothing).toEqual([]); // no slot bullets -> nothing worn
    const built = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
    const all = built.messages.map((m) => m.content).join("\n");
    expect(all).toContain("[Personality]"); // the sheet itself DID reach the prompt
    // The whole section is gone, not just its header. Assert on a marker inside its
    // BODY: the bare token "[Clothing]" is unusable here because the output contract
    // lists every canonical section name.
    expect(all).not.toContain("NOISE_CLOTHING_SECTION");
    expect(all).not.toContain("(not established)");
  });

  it("renders a worn outfit as a derived line and still never the raw section", () => {
    const tpl = {
      id: "tpl_dressed", name: "Dressed Subject", version: 1,
      summary: "A test character.",
      content: "[Species]: Human\n\n[Clothing]\n- Top: Linen tunic\n- Feet: Sandals\n\n[Personality]\n- Watchful.",
      startingClothing: [{ slot: "Top", name: "Linen tunic" }, { slot: "Feet", name: "Sandals" }],
    };
    const pt = createInitialPlaythrough("Clothing Test 2", undefined, [tpl]);
    const built = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
    const all = built.messages.map((m) => m.content).join("\n");
    expect(all).toContain("Clothing: Top: Linen tunic; Feet: Sandals");
    expect(all).not.toContain("- Top: Linen tunic");
  });
});

describe("token calibration", () => {
  it("(a) a high calibration makes selectHistory send fewer messages than no calibration", () => {
    const pt = withHistory(10, 100); // each message ~29 estimated tokens
    const uncalibrated = selectHistory(pt, 300, 1);
    const calibrated = selectHistory(pt, 300, 3);

    expect(calibrated.history.length).toBeLessThan(uncalibrated.history.length);
    expect(calibrated.history.length).toBeGreaterThanOrEqual(MIN_HISTORY_MESSAGES);
    // The same cap a scaled estimate implies: at 3x, ~79 tokens per 100-char message.
    expect(calibrated.history.every((m) => m.content.length === 100)).toBe(true);
  });

  it("(b) floors at 1 when the provider measured fewer tokens than estimated", () => {
    expect(clampCalibration(0.5)).toBe(1);
    expect(clampCalibration(0.99)).toBe(1);
  });

  it("(c) caps at 4 so an outlier measurement cannot blow the budget", () => {
    expect(clampCalibration(4)).toBe(4);
    expect(clampCalibration(9.5)).toBe(4);
    expect(clampCalibration(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("(d) returns 1 for absent, non-finite, zero and negative values", () => {
    expect(clampCalibration(undefined)).toBe(1);
    expect(clampCalibration(Number.NaN)).toBe(1);
    expect(clampCalibration(0)).toBe(1);
    expect(clampCalibration(-2)).toBe(1);
  });

  it("(g) keeps the reported estimate on the unscaled basis (feedback-loop guard)", () => {
    // History that comfortably fits at both calibrations: the kept set is equal,
    // so any difference in `promptUsage` would come purely from scaling.
    const pt = withHistory(3, 100);
    const budget = { contextWindow: 65536, reserveOutputTokens: 1200 };
    const plain = assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG);
    const scaled = assembleTurnPrompt(parseUserInput("go"), pt, true, [], { ...budget, calibration: 4 }, CFG);

    expect(scaled.promptUsage).toEqual(plain.promptUsage);
    expect(scaled.promptUsage.estimated).toBe(plain.promptUsage.estimated);

    // Even when the calibration changes what is sent, history-independent
    // segments stay on the unscaled chars/4 basis.
    const tight = { contextWindow: 3000, reserveOutputTokens: 1200 };
    const plainTight = assembleTurnPrompt(parseUserInput("go"), pt, true, [], tight, CFG);
    const scaledTight = assembleTurnPrompt(parseUserInput("go"), pt, true, [], { ...tight, calibration: 4 }, CFG);
    expect(scaledTight.promptUsage.breakdown.outputFormat).toBe(
      plainTight.promptUsage.breakdown.outputFormat
    );
    expect(scaledTight.promptUsage.breakdown.userInput).toBe(plainTight.promptUsage.breakdown.userInput);
  });

  it("scales estimateTokens only when an explicit scale is passed", () => {
    expect(estimateTokens(400)).toBe(100);
    expect(estimateTokens(400, 2.5)).toBe(250);
    expect(estimateTokens(400, 1)).toBe(100);
  });
});

describe("macro expansion coverage", () => {
  const budget = { contextWindow: 65536, reserveOutputTokens: 1200 };
  const promptOf = (pt: ReturnType<typeof createInitialPlaythrough>) =>
    assembleTurnPrompt(parseUserInput("go"), pt, true, [], budget, CFG).messages
      .map((m) => m.content).join("\n");

  /** renderLorebookSegments reads only content/position/depth/order, so the cast keeps
   *  this fixture honest about the fields under test (tests/lorebook.test.ts has the
   *  full-shape builder). */
  const activated = (content: string, position: number, depth = 4, order = 100) =>
    ({ entry: { content, position, depth, order } }) as unknown as ActivatedEntry;

  it("expands {{user}} in lorebook entries and leaves {{char}} literal", () => {
    const { before, after, depth } = renderLorebookSegments([
      activated("{{char}} follows {{user}} through the gate.", 0),
      activated("{{user}}'s satchel holds {{char}}'s letter.", 1),
      activated("Deeper lore for {{user}}.", 2, 6),
      activated("Shallower lore for {{ user }}.", 2, 2),
    ], "Anon");

    // {{user}} resolves everywhere...
    expect(before).toBe("{{char}} follows Anon through the gate.");
    expect(after).toBe("Anon's satchel holds {{char}}'s letter.");
    // ...and {{char}} is deliberately preserved: an entry belongs to no single character.
    expect(before).toContain("{{char}}");
    expect(after).toContain("{{char}}");
    // Depth entries stay sorted by depth (shallower first), and whitespace-tolerant.
    expect(depth.indexOf("Shallower")).toBeLessThan(depth.indexOf("Deeper"));
    expect(depth).not.toContain("{{ user }}");
  });

  it("returns empty segments for no activated entries", () => {
    expect(renderLorebookSegments([], "Anon")).toEqual({ before: "", after: "", depth: "" });
  });

  it("expands {{user}} in the player character's own fields and leaves {{char}}", () => {
    const pt = createInitialPlaythrough("Player Macro Test");
    pt.playerCharacter.name = "Anon";
    pt.playerCharacter.description = "{{user}} is a drifter; {{char}} means nothing here.";
    pt.playerCharacter.appearance = "{{ user }} wears a worn coat.";
    const all = promptOf(pt);
    expect(all).toContain("Anon is a drifter; {{char}} means nothing here.");
    expect(all).toContain("Anon wears a worn coat.");
  });

  it("expands the present character's memory line with that character as {{char}}", () => {
    const pt = createInitialPlaythrough("Memory Macro Test");
    pt.playerCharacter.name = "Anon";
    pt.characters[0].memorySummary = "{{char}} trusts {{user}} now.";
    expect(promptOf(pt)).toContain(`${pt.characters[0].name} trusts Anon now.`);
  });

  it("leaks no unresolved {{user}} anywhere in an assembled prompt", () => {
    const pt = createInitialPlaythrough("No Leak Test");
    pt.playerCharacter.name = "Anon";
    pt.playerCharacter.description = "{{user}} again.";
    pt.characters[0].memorySummary = "{{user}} and {{char}}.";
    const all = promptOf(pt);
    expect(all.match(/\{\{\s*user\s*\}\}/gi) ?? []).toHaveLength(0);
  });
});
