import type { Playthrough } from "../../schemas";

/** One image the gallery can offer, with everything its caption needs. */
export type CoverMediaItem = {
  /** "<sha256>.<ext>" — the content-addressed file; the tile builds its URL from it. */
  file: string;
  prompt: string;
  createdAt: string;
  turn?: number;
  /** The closed chapter the message belongs to, when it has one. Messages of the running
   *  chapter carry no label. */
  chapterName?: string;
};

/**
 * Every generated image in the story, newest first — the gallery's list.
 *
 * Ordering matches the automatic cover chain deliberately: newest message first, and within a
 * message the LAST image first, because variants are ordered and the last one is the most
 * recent render.
 *
 * Three rules, each for a reason:
 *
 * - hidden messages are skipped, like `visibleMessageCount` and the automatic cover;
 * - one entry per FILE, because the store is content-addressed — the same bytes reached from two
 *   messages are one image, and listing it twice would be a lie about how many renders exist;
 * - timeline branches are not walked at all: a branch's media is its own document's, and how
 *   branches and their images should relate is unresolved.
 */
export function buildCoverMedia(playthrough: Playthrough): CoverMediaItem[] {
  const chapterNameById = new Map(playthrough.chapters.map((chapter) => [chapter.id, chapter.name]));
  const items: CoverMediaItem[] = [];
  const seen = new Set<string>();

  for (let index = playthrough.messages.length - 1; index >= 0; index -= 1) {
    const message = playthrough.messages[index];
    if (message.hidden) continue;
    const images = message.images ?? [];
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      const image = images[imageIndex];
      if (!image?.file || seen.has(image.file)) continue;
      seen.add(image.file);
      items.push({
        file: image.file,
        prompt: image.prompt ?? "",
        createdAt: image.createdAt,
        ...(message.turn === undefined ? {} : { turn: message.turn }),
        ...(message.chapterId && chapterNameById.has(message.chapterId)
          ? { chapterName: chapterNameById.get(message.chapterId) }
          : {})
      });
    }
  }

  return items;
}
