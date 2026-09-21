import { describe, expect, it } from "vitest";
import {
  BRAINSTORM_MESSAGE_LIMIT,
  BRAINSTORM_STORAGE_VERSION,
  brainstormHistoryContent,
  brainstormStorageKey,
  buildBrainstormSession,
  decodeLegacyBrainstormSession,
  findJsonBlocks,
  isBrainstormMessage,
  parseBrainstormReply,
  parseBrainstormSession,
  sanitiseTagList,
  toProposal,
  trimBrainstormMessages
} from "../src/engine/brainstorm";

const SECTIONS = ["Personality", "Likes", "Backstory"];

function block(value: unknown): string {
  return ["```json", JSON.stringify(value), "```"].join(String.fromCharCode(10));
}

describe("reading a reply", () => {
  it("keeps the prose and takes the proposals out of the block", () => {
    const text = ["Here is what I would change.", "", block({ proposedChanges: { sections: [{ header: "Likes", body: "- tea brewing" }] } })].join(String.fromCharCode(10));
    const parsed = parseBrainstormReply(text, SECTIONS);
    expect(parsed.reply).toBe("Here is what I would change.");
    expect(parsed.reply).not.toContain("```");
    expect(parsed.proposedChanges?.sections).toEqual([{ header: "Likes", body: "- tea brewing" }]);
    expect(parsed.hadBlock).toBe(true);
  });

  it("takes the last block when the model thinks aloud first", () => {
    const text = [
      block({ proposedChanges: { sections: [{ header: "Likes", body: "- wrong" }] } }),
      "Actually, this:",
      block({ proposedChanges: { sections: [{ header: "Likes", body: "- right" }] } })
    ].join(String.fromCharCode(10));
    const parsed = parseBrainstormReply(text, SECTIONS);
    expect(parsed.proposedChanges?.sections?.[0]?.body).toBe("- right");
    expect(parsed.reply).toBe("Actually, this:");
  });

  it("leaves a prose-only answer alone", () => {
    const parsed = parseBrainstormReply("Just an idea: give her a hobby.", SECTIONS);
    expect(parsed.reply).toBe("Just an idea: give her a hobby.");
    expect(parsed.proposedChanges).toBeUndefined();
    expect(parsed.hadBlock).toBe(false);
  });

  it("drops a block it cannot parse instead of showing JSON as chat", () => {
    const text = ["My suggestion:", "", "```json", "{ this is not json", "```"].join(String.fromCharCode(10));
    const parsed = parseBrainstormReply(text, SECTIONS);
    expect(parsed.reply).toBe("My suggestion:");
    expect(parsed.reply).not.toContain("{ this is not json");
    expect(parsed.proposedChanges).toBeUndefined();
    expect(parsed.hadBlock).toBe(true);
  });

  it("keeps the text when the reply was nothing but a block", () => {
    const only = block({ proposedChanges: { sections: [{ header: "Likes", body: "- tea" }] } });
    const parsed = parseBrainstormReply(only, SECTIONS);
    expect(parsed.reply).toBe(only);
  });

  it("still reads the old whole-JSON envelope rather than showing it", () => {
    const text = JSON.stringify({ reply: "She reads as guarded.", proposedChanges: { sections: [{ header: "Personality", body: "- guarded" }] } });
    const parsed = parseBrainstormReply(text, SECTIONS);
    expect(parsed.reply).toBe("She reads as guarded.");
    expect(parsed.proposedChanges?.sections?.[0]?.header).toBe("Personality");
  });

  it("leaves prose that merely starts with a brace alone", () => {
    const parsed = parseBrainstormReply("{not json} but it is my answer", SECTIONS);
    expect(parsed.reply).toBe("{not json} but it is my answer");
    expect(parsed.hadBlock).toBe(false);
  });

  it("accepts a block whose object is wrapped in proposedChanges, and one that is not", () => {
    const wrapped = parseBrainstormReply(block({ proposedChanges: { sections: [{ header: "Likes", body: "- x" }] } }), SECTIONS);
    const bare = parseBrainstormReply(block({ sections: [{ header: "Likes", body: "- x" }] }), SECTIONS);
    expect(wrapped.proposedChanges?.sections?.[0]?.body).toBe("- x");
    expect(bare.proposedChanges?.sections?.[0]?.body).toBe("- x");
  });

  it("finds every block, wherever it sits", () => {
    const blocks = findJsonBlocks(["a", block({ a: 1 }), "b", block({ b: 2 })].join(String.fromCharCode(10)));
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.body).toBe('{"b":2}');
  });
});

describe("what a proposal may contain", () => {
  it("strips brackets and writes a matched header the sheet's own way", () => {
    const { proposal, unmapped } = toProposal({ sections: [{ header: "[LIkes]", body: "- tea" }] }, SECTIONS);
    // The merge is case-insensitive either way; the sheet's spelling is what the card should show.
    expect(proposal?.sections).toEqual([{ header: "Likes", body: "- tea" }]);
    expect(unmapped).toEqual([]);
  });

  it("does not read a longer name as the section it happens to start with", () => {
    // "[House Cat]" is a section about a character's cat, not the sheet's [House] with a tail.
    const { proposal } = toProposal({ sections: [{ header: "House Cat", body: "- Purrs" }] }, ["Species", "House"]);
    expect(proposal?.sections).toEqual([{ header: "House Cat", body: "- Purrs" }]);
  });

  it("drops a header the sheet does not have, and says which, when additions are off", () => {
    const { proposal, unmapped, added } = toProposal(
      { sections: [{ header: "Likes", body: "- tea" }, { header: "Favourite Weather", body: "- rain" }] },
      SECTIONS,
      { allowNewSections: false }
    );
    expect(proposal?.sections?.map((s) => s.header)).toEqual(["Likes"]);
    expect(unmapped).toEqual(["Favourite Weather"]);
    expect(added).toEqual([]);
  });

  it("keeps every header when the caller did not say what the sheet has", () => {
    const { proposal, unmapped, added } = toProposal({ sections: [{ header: "Whatever", body: "- x" }] });
    expect(proposal?.sections).toHaveLength(1);
    expect(unmapped).toEqual([]);
    // Nothing can be called an addition when there is no list to compare against.
    expect(added).toEqual([]);
  });

  it("carries a name, notes, tags and a whole-sheet rewrite", () => {
    const { proposal } = toProposal(
      { name: "Mira Vale", creatorNotes: "Revised voice.", tags: ["elf", "elf", " mage "], fullContent: "[Species]: Elf" },
      SECTIONS
    );
    expect(proposal?.name).toBe("Mira Vale");
    expect(proposal?.creatorNotes).toBe("Revised voice.");
    expect(proposal?.tags).toEqual(["elf", "mage"]);
    expect(proposal?.fullContent).toBe("[Species]: Elf");
  });

  it("proposes nothing when there is nothing to propose", () => {
    expect(toProposal({ sections: [] }, SECTIONS).proposal).toBeUndefined();
    expect(toProposal({ sections: [{ header: "Likes", body: "   " }] }, SECTIONS).proposal).toBeUndefined();
    expect(toProposal(null, SECTIONS).proposal).toBeUndefined();
  });

  it("ignores malformed section entries", () => {
    const { proposal } = toProposal({ sections: [{ header: 42, body: "- x" }, { body: "- no header" }, "nope"] }, SECTIONS);
    expect(proposal).toBeUndefined();
  });

  it("cleans a tag list without inventing tags", () => {
    expect(sanitiseTagList([" a ", "", "A", 7, "b"])).toEqual(["a", "b"]);
    expect(sanitiseTagList([])).toEqual([]);
  });
});

describe("sections the format does not have", () => {
  const blockWith = (sections: Array<{ header: string; body: string }>) =>
    ["```json", JSON.stringify({ proposedChanges: { sections } }), "```"].join(String.fromCharCode(10));

  it("keeps them as additions by default, and marks them as new", () => {
    const parsed = parseBrainstormReply(
      blockWith([{ header: "Cat Traits", body: "- Purrs" }, { header: "Likes", body: "- Sunbeams" }]),
      SECTIONS
    );
    expect(parsed.proposedChanges?.sections?.map((s) => s.header)).toEqual(["Cat Traits", "Likes"]);
    expect(parsed.newSections).toEqual(["Cat Traits"]);
    expect(parsed.unmappedHeaders).toEqual([]);
  });

  it("drops and reports them when new sections are not allowed", () => {
    const parsed = parseBrainstormReply(
      blockWith([{ header: "Cat Traits", body: "- Purrs" }, { header: "Likes", body: "- Sunbeams" }]),
      SECTIONS,
      { allowNewSections: false }
    );
    expect(parsed.proposedChanges?.sections?.map((s) => s.header)).toEqual(["Likes"]);
    expect(parsed.unmappedHeaders).toEqual(["Cat Traits"]);
    expect(parsed.newSections).toEqual([]);
  });

  it("does not add a twin of a section the sheet already has", () => {
    // The hazard the guard was aimed at, handled properly: a near-miss is that section, not a new one.
    const parsed = parseBrainstormReply(
      blockWith([
        { header: "Likes & Dislikes", body: "- Sunbeams" },
        { header: "Personality & Voice", body: "- Warm" },
        { header: "likes ", body: "- Naps" }
      ]),
      SECTIONS
    );
    expect(parsed.proposedChanges?.sections?.map((s) => s.header)).toEqual(["Likes", "Personality", "Likes"]);
    expect(parsed.newSections).toEqual([]);
    expect(parsed.unmappedHeaders).toEqual([]);
  });

  it("leaves a genuinely different name alone", () => {
    const parsed = parseBrainstormReply(blockWith([{ header: "Daily Life", body: "- Naps at noon" }]), SECTIONS);
    expect(parsed.proposedChanges?.sections?.[0]?.header).toBe("Daily Life");
    expect(parsed.newSections).toEqual(["Daily Life"]);
  });

  it("still keeps everything when the caller did not say what the sheet has", () => {
    const parsed = parseBrainstormReply(blockWith([{ header: "Whatever", body: "- x" }]));
    expect(parsed.proposedChanges?.sections).toHaveLength(1);
    expect(parsed.newSections).toEqual([]);
  });
});

describe("the history the model sees", () => {
  it("carries the proposals back, so a follow-up can refer to them", () => {
    const content = brainstormHistoryContent({
      content: "Here you go.",
      proposedChanges: { sections: [{ header: "Likes", body: "- tea" }] }
    });
    expect(content.startsWith("Here you go.")).toBe(true);
    expect(content).toContain("proposedChanges");
    expect(content).toContain('"header":"Likes"');
  });

  it("is just the text when nothing was proposed", () => {
    expect(brainstormHistoryContent({ content: "Just talking." })).toBe("Just talking.");
  });
});

describe("the per-character session", () => {
  it("keys by character", () => {
    expect(brainstormStorageKey("abc")).toBe("bobbinloom_brainstorm_abc");
  });

  it("reads the legacy key's own format, not just a writer it shares code with", () => {
    // A literal in the old on-disk shape: a fixture proves the FORMAT is understood, where a round
    // trip only proves the two functions agree with each other.
    const raw = JSON.stringify({
      v: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [
        { id: "1", role: "user", content: "hi" },
        { id: "2", role: "assistant", content: "hello" }
      ]
    });
    expect(decodeLegacyBrainstormSession(raw)).toEqual([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" }
    ]);
  });

  it("refuses what it cannot trust", () => {
    expect(decodeLegacyBrainstormSession(null)).toBeNull();
    expect(decodeLegacyBrainstormSession("not json")).toBeNull();
    expect(decodeLegacyBrainstormSession(JSON.stringify({ v: 99, messages: [] }))).toBeNull();
    expect(decodeLegacyBrainstormSession(JSON.stringify({ v: 1, messages: "no" }))).toBeNull();
  });

  it("leaves a short session alone", () => {
    const messages = [{ role: "user" }, { role: "assistant" }];
    expect(trimBrainstormMessages(messages, 5)).toEqual(messages);
  });

  it("keeps the tail of a long one, starting on a question", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant" }));
    const kept = trimBrainstormMessages(messages, 4);
    expect(kept).toHaveLength(4);
    expect(kept[0]?.role).toBe("user");
  });

  it("describes the message limit as a number of messages", () => {
    expect(typeof BRAINSTORM_MESSAGE_LIMIT).toBe("number");
  });

  it("recognises a stored message and refuses anything else", () => {
    expect(isBrainstormMessage({ id: "1", role: "user", content: "x" })).toBe(true);
    expect(isBrainstormMessage({ id: "1", role: "system", content: "x" })).toBe(false);
    expect(isBrainstormMessage({ id: 1, role: "user", content: "x" })).toBe(false);
    expect(isBrainstormMessage(null)).toBe(false);
  });
});

describe("a session built from loose messages", () => {
  it("drops what is not a message and keeps the usable ones", () => {
    const session = buildBrainstormSession([
      null,
      "not a message",
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant" },
      { id: "3", role: "assistant", content: "hello" }
    ]);
    // One bad entry costs its own message, not the conversation.
    expect(session.messages).toEqual([
      { id: "1", role: "user", content: "hi" },
      { id: "3", role: "assistant", content: "hello" }
    ]);
    expect(session.v).toBe(BRAINSTORM_STORAGE_VERSION);
    expect(typeof session.updatedAt).toBe("string");
  });

  it("trims a long one to the message limit", () => {
    const many = Array.from({ length: BRAINSTORM_MESSAGE_LIMIT + 4 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `line ${i}`
    }));
    const session = buildBrainstormSession(many);
    expect(session.messages).toHaveLength(BRAINSTORM_MESSAGE_LIMIT);
    expect(session.messages[0]?.role).toBe("user");
    expect(session.messages[session.messages.length - 1]?.id).toBe(`m${BRAINSTORM_MESSAGE_LIMIT + 3}`);
  });
});

describe("a session read back from the store", () => {
  it("refuses a non-object, a stale version and messages that are not a list", () => {
    expect(parseBrainstormSession(null)).toBeNull();
    expect(parseBrainstormSession("nope")).toBeNull();
    expect(parseBrainstormSession({ v: 99, updatedAt: "2026-01-01T00:00:00.000Z", messages: [] })).toBeNull();
    expect(parseBrainstormSession({ v: 1, updatedAt: "2026-01-01T00:00:00.000Z", messages: "no" })).toBeNull();
  });

  it("treats an empty message list as a session, not as nothing", () => {
    const session = parseBrainstormSession({ v: 1, updatedAt: "2026-01-01T00:00:00.000Z", messages: [] });
    expect(session?.messages).toEqual([]);
  });

  it("keeps a stored time and supplies one when it is missing", () => {
    const kept = parseBrainstormSession({ v: 1, updatedAt: "2026-01-01T00:00:00.000Z", messages: [] });
    const stamped = parseBrainstormSession({ v: 1, messages: [] });
    expect(kept?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(typeof stamped?.updatedAt).toBe("string");
  });

  it("drops unusable messages rather than the session", () => {
    const session = parseBrainstormSession({
      v: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [null, "x", { id: "1", role: "user", content: "hi" }]
    });
    expect(session?.messages).toEqual([{ id: "1", role: "user", content: "hi" }]);
  });
});
