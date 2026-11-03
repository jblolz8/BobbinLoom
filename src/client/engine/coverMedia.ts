import type { Chapter, Playthrough } from "../../schemas";

/** One image the gallery can offer, with everything its caption and its grouping need. */
export type CoverMediaItem = {
  /** "<sha256>.<ext>" — the content-addressed file; the tile builds its URL from it. */
  file: string;
  prompt: string;
  createdAt: string;
  turn?: number;
  /** The closed chapter the message belongs to, when it has one. Messages of the running
   *  chapter carry no label. */
  chapterName?: string;
  /** The same chapter's id, so grouping never depends on a display name. */
  chapterId?: string;
  /** True when the image belongs to `playthrough.galleryImages` (custom upload). */
  isUploaded?: boolean;
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
 * - **an archived chapter's images are INCLUDED.** Closing a chapter hides its messages, and the
 *   gallery's job is the whole story: an image you generated does not stop existing because its
 *   chapter was summarized. (The automatic cover chain does skip hidden messages, deliberately:
 *   a card wears the newest image of the story you are playing, which is a different set.)
 * - one entry per FILE, because the store is content-addressed — the same bytes reached from two
 *   messages are one image, and listing it twice would be a lie about how many renders exist. The
 *   survivor is the NEWEST reference, so a shared image groups under the chapter that used it last;
 * - timeline branches are not walked at all: a branch's media is its own document's, and how
 *   branches and their images should relate is unresolved.
 */
export function buildCoverMedia(playthrough: Playthrough): CoverMediaItem[] {
  const chapterNameById = new Map(
    playthrough.chapters.map((chapter) => [chapter.id, chapter.name]),
  );
  const galleryByFile = new Map(
    (playthrough.galleryImages ?? [])
      .filter((g) => Boolean(g?.file))
      .map((g) => [g.file, g]),
  );
  const messageItems: CoverMediaItem[] = [];
  const seen = new Set<string>();

  for (let index = playthrough.messages.length - 1; index >= 0; index -= 1) {
    const message = playthrough.messages[index];
    const images = message.images ?? [];
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      const image = images[imageIndex];
      if (!image?.file || seen.has(image.file)) continue;
      seen.add(image.file);
      const chapterId = message.chapterId;
      const galleryEntry = galleryByFile.get(image.file);
      messageItems.push({
        file: image.file,
        prompt: image.prompt || galleryEntry?.label || "",
        createdAt: image.createdAt,
        ...(message.turn === undefined ? {} : { turn: message.turn }),
        ...(chapterId ? { chapterId } : {}),
        ...(chapterId && chapterNameById.has(chapterId)
          ? { chapterName: chapterNameById.get(chapterId) }
          : {}),
        ...(galleryEntry ? { isUploaded: true } : {}),
      });
    }
  }

  const standaloneGalleryItems: CoverMediaItem[] = [];
  const galleryList = playthrough.galleryImages ?? [];
  for (let index = galleryList.length - 1; index >= 0; index -= 1) {
    const entry = galleryList[index];
    if (!entry?.file || seen.has(entry.file)) continue;
    seen.add(entry.file);
    standaloneGalleryItems.push({
      file: entry.file,
      prompt: entry.label ?? "",
      createdAt: entry.createdAt,
      isUploaded: true,
    });
  }

  return [...messageItems, ...standaloneGalleryItems];
}

/** One section of the gallery: a chapter's images, or the running chapter's own. */
export type CoverMediaGroup = {
  /** `null` for the running chapter, which has no chapter record. */
  chapterId: string | null;
  name: string;
  items: CoverMediaItem[];
};

/**
 * The gallery's grouping of that list: the running chapter first, then archived chapters
 * newest-first (the order every other chapter list in the app uses).
 *
 * An image tagged with a chapter whose record is gone — a revert discards records — has no
 * section of its own to belong to, so it lands in the running group rather than under a heading
 * naming a chapter that no longer exists.
 */
export function groupCoverMedia(
  media: CoverMediaItem[],
  chapters: Chapter[],
): CoverMediaGroup[] {
  const byId = new Map<string, CoverMediaItem[]>();
  const running: CoverMediaItem[] = [];

  for (const item of media) {
    if (!item.chapterId) {
      running.push(item);
      continue;
    }
    const bucket = byId.get(item.chapterId) ?? [];
    bucket.push(item);
    byId.set(item.chapterId, bucket);
  }

  const groups: CoverMediaGroup[] = [
    { chapterId: null, name: "Current chapter", items: running },
  ];
  for (const chapter of [...chapters].reverse()) {
    const items = byId.get(chapter.id);
    if (!items || items.length === 0) continue;
    groups.push({ chapterId: chapter.id, name: chapter.name, items });
  }
  for (const [chapterId, items] of byId) {
    if (chapters.some((chapter) => chapter.id === chapterId)) continue;
    groups[0].items.push(...items);
  }

  return groups;
}
