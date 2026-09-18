/** The gallery's list, as a pure function.
 *
 *  `buildCoverMedia` decides what the gallery offers and in what order, and its ordering is the
 *  same rule the automatic cover uses (newest message first, last image first inside it) — so a
 *  wrong walk here shows up as "the gallery's first tile is not the cover the card wears".
 *
 *  No filesystem, no React: the playthrough is built in memory from the engine's own factory. */
import { describe, expect, it } from "vitest";
import type { ChatMessage, MessageImage } from "../src/schemas";
import { buildCoverMedia } from "../src/client/engine/coverMedia";
import { createBlankPlaythrough } from "../src/engine/playthroughFactory";

function image(file: string): MessageImage {
  return {
    file,
    prompt: `prompt for ${file}`,
    providerId: "venice_images",
    model: "test-image-model",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function message(id: string, images: MessageImage[] = [], extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: "assistant",
    content: `content of ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(images.length ? { images } : {}),
    ...extra
  };
}

describe("buildCoverMedia", () => {
  it("walks newest message first, and the LAST image of that message first", () => {
    const pt = createBlankPlaythrough("Media");
    pt.messages = [
      message("m1", [image("aaa.png")]),
      message("m2", [image("bbb.png")]),
      message("m3", [image("ccc.png"), image("ddd.png")])
    ];

    expect(buildCoverMedia(pt).map((item) => item.file)).toEqual([
      "ddd.png",
      "ccc.png",
      "bbb.png",
      "aaa.png"
    ]);
  });

  it("skips hidden messages", () => {
    const pt = createBlankPlaythrough("Hidden");
    pt.messages = [
      message("m1", [image("keep.png")]),
      message("m2", [image("gone.png")], { hidden: true })
    ];

    expect(buildCoverMedia(pt).map((item) => item.file)).toEqual(["keep.png"]);
  });

  it("lists one entry per FILE, because the store is content-addressed", () => {
    const pt = createBlankPlaythrough("Shared");
    pt.messages = [message("m1", [image("same.png")]), message("m2", [image("same.png")])];

    expect(buildCoverMedia(pt).map((item) => item.file)).toEqual(["same.png"]);
  });

  it("carries the turn and the chapter name when the message has them", () => {
    const pt = createBlankPlaythrough("Chapters");
    pt.chapters = [
      {
        id: "ch_1",
        name: "Volume One",
        shortDescription: "the beginning",
        fullSummary: "a longer summary",
        turnRange: { start: 1, end: 4 },
        messageIds: ["m1"],
        memoryEventIds: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    pt.messages = [
      message("m1", [image("archived.png")], { turn: 3, chapterId: "ch_1" }),
      message("m2", [image("running.png")], { turn: 9 })
    ];

    const items = buildCoverMedia(pt);

    expect(items[0]).toMatchObject({ file: "running.png", turn: 9 });
    expect(items[0].chapterName).toBeUndefined();
    expect(items[1]).toMatchObject({ file: "archived.png", turn: 3, chapterName: "Volume One" });
  });

  it("ignores messages that carry no image at all", () => {
    const pt = createBlankPlaythrough("Text only");
    pt.messages = [message("m1"), message("m2", [image("only.png")]), message("m3")];

    expect(buildCoverMedia(pt).map((item) => item.file)).toEqual(["only.png"]);
  });

  it("is empty for a story with no images", () => {
    const pt = createBlankPlaythrough("Bare");
    pt.messages = [message("m1")];

    expect(buildCoverMedia(pt)).toEqual([]);
  });
});
