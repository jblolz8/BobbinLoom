/** The gallery's list, as a pure function.
 *
 *  `buildCoverMedia` decides what the gallery offers and in what order, and its ordering is the
 *  same rule the automatic cover uses (newest message first, last image first inside it) — so a
 *  wrong walk here shows up as "the gallery's first tile is not the cover the card wears".
 *
 *  No filesystem, no React: the playthrough is built in memory from the engine's own factory. */
import { describe, expect, it } from "vitest";
import type { Chapter, ChatMessage, MessageImage } from "../src/schemas";
import { buildCoverMedia, groupCoverMedia } from "../src/client/engine/coverMedia";
import { createBlankPlaythrough } from "../src/engine/playthroughFactory";

function chapter(id: string, name: string, start: number, end: number): Chapter {
  return {
    id,
    name,
    shortDescription: `${name} short`,
    fullSummary: `${name} full`,
    turnRange: { start, end },
    messageIds: [],
    memoryEventIds: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

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

  it("includes an ARCHIVED chapter's images — closing a chapter does not unmake them", () => {
    const pt = createBlankPlaythrough("Archived");
    pt.chapters = [chapter("ch_1", "Volume One", 1, 4)];
    pt.messages = [
      message("m1", [image("archived.png")], { hidden: true, chapterId: "ch_1", turn: 3 }),
      message("m2", [image("running.png")], { turn: 9 })
    ];

    const items = buildCoverMedia(pt);

    // Newest first still: the running chapter's image leads, the archived chapter's follows.
    expect(items.map((item) => item.file)).toEqual(["running.png", "archived.png"]);
    expect(items[1]).toMatchObject({ chapterId: "ch_1", chapterName: "Volume One", turn: 3 });
    expect(items[0].chapterId).toBeUndefined();
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

  it("groups a shared file under the NEWEST chapter that references it", () => {
    const pt = createBlankPlaythrough("Shared across chapters");
    pt.chapters = [chapter("ch_1", "Volume One", 1, 4), chapter("ch_2", "Volume Two", 5, 9)];
    pt.messages = [
      message("m1", [image("same.png")], { hidden: true, chapterId: "ch_1", turn: 3 }),
      message("m2", [image("same.png")], { hidden: true, chapterId: "ch_2", turn: 7 })
    ];

    const items = buildCoverMedia(pt);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ file: "same.png", chapterId: "ch_2", chapterName: "Volume Two" });
  });

  it("is empty for a story with no images", () => {
    const pt = createBlankPlaythrough("Bare");
    pt.messages = [message("m1")];

    expect(buildCoverMedia(pt)).toEqual([]);
  });
});

describe("groupCoverMedia", () => {
  it("puts the running chapter first, then archived chapters newest-first", () => {
    const pt = createBlankPlaythrough("Grouped");
    pt.chapters = [chapter("ch_1", "Volume One", 1, 4), chapter("ch_2", "Volume Two", 5, 9)];
    pt.messages = [
      message("m1", [image("one.png")], { hidden: true, chapterId: "ch_1", turn: 3 }),
      message("m2", [image("two.png")], { hidden: true, chapterId: "ch_2", turn: 7 }),
      message("m3", [image("live.png")], { turn: 11 })
    ];

    const groups = groupCoverMedia(buildCoverMedia(pt), pt.chapters);

    expect(groups.map((group) => group.name)).toEqual(["Current chapter", "Volume Two", "Volume One"]);
    expect(groups[0].chapterId).toBeNull();
    expect(groups[0].items.map((item) => item.file)).toEqual(["live.png"]);
    expect(groups[1].items.map((item) => item.file)).toEqual(["two.png"]);
  });

  it("skips chapters with no images, and keeps a chapter-less image in the running group", () => {
    const pt = createBlankPlaythrough("Sparse");
    pt.chapters = [
      chapter("ch_1", "Volume One", 1, 4),
      chapter("ch_2", "Volume Two", 5, 9)
    ];
    pt.messages = [
      message("m1", [image("two.png")], { hidden: true, chapterId: "ch_2", turn: 7 }),
      // A chapter record a revert discarded: the image still exists, so it still needs a home.
      message("m2", [image("orphan.png")], { hidden: true, chapterId: "ch_gone", turn: 6 })
    ];

    const groups = groupCoverMedia(buildCoverMedia(pt), pt.chapters);

    expect(groups.map((group) => group.name)).toEqual(["Current chapter", "Volume Two"]);
    expect(groups[0].items.map((item) => item.file)).toEqual(["orphan.png"]);
  });
});
