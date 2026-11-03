/** Which image a playthrough card wears, and why.
 *
 *  The chain, highest priority first:
 *
 *    1. `manual`  — the player picked it in the gallery. A pointer whose file has since
 *                   disappeared falls through rather than rendering broken, so a stale
 *                   choice self-heals instead of blanking the card.
 *    2. `latest`  — the newest image the story has produced.
 *    3. `cast`    — a collage of the PRESENT cast's portraits (the same presence rule the
 *                   prompt builder uses: `activeCharacters`), capped.
 *    4. `null`    — nothing to show; the client renders the placeholder mark.
 *
 *  This lives outside `store.ts` on purpose: it needs the image store for the
 *  file-existence check, and `imageStore` already imports the store for its sweep, so a
 *  direct import there would close the cycle. `store.ts` takes the resolver as an injected
 *  option instead (see `PlaythroughSummaryOptions`).
 *
 *  Timeline-branch images are deliberately NOT a source: how a branch's media should behave
 *  is unresolved, and a branch is excluded from the library list anyway. */
import type { Playthrough, PlaythroughCoverView } from "../schemas";
import { imageFilePath } from "./imageStore";
import { resolveCharacterPortraits } from "./store";

/** How many present characters a collage tile grid holds before the rest are counted rather
 *  than drawn — a card is too small for readable art past four. */
export const COVER_COLLAGE_LIMIT = 4;

export type CoverResolverOptions = {
  /** Injectable seam: the content-addressed image directory. Every existence check goes
   *  through `imageFilePath`, so a malformed name can never reach the disk. */
  imagesDir: string;
  /** Playthroughs root directory (`data/playthroughs`) where per-playthrough `<id>/images/` folders live. */
  dataDir?: string;
  /** Injectable seam for the character library, where cast portraits live. Defaults to the
   *  real library directory. */
  charactersDir?: string;
};

export function resolvePlaythroughCover(
  p: Playthrough,
  options: CoverResolverOptions,
): PlaythroughCoverView | null {
  const manualFile = p.cover?.file;
  if (
    manualFile &&
    imageFilePath(manualFile, options.imagesDir, options.dataDir, p.id)
  ) {
    return { source: "manual", file: manualFile };
  }

  // Newest non-hidden message that carries an image, taking its LAST image: variants are
  // ordered, so the last one is the most recent render. Hidden messages are skipped to stay
  // consistent with `visibleMessageCount` / `lastMessagePreview` in the same projection.
  for (let index = p.messages.length - 1; index >= 0; index -= 1) {
    const message = p.messages[index];
    if (message.hidden) continue;
    const images = message.images ?? [];
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      const file = images[imageIndex]?.file;
      if (file && imageFilePath(file, options.imagesDir, options.dataDir, p.id))
        return { source: "latest", file };
    }
  }

  const gallery = p.galleryImages ?? [];
  for (let index = gallery.length - 1; index >= 0; index -= 1) {
    const file = gallery[index]?.file;
    if (file && imageFilePath(file, options.imagesDir, options.dataDir, p.id)) {
      return { source: "latest", file };
    }
  }

  // Cast order, not recency: a cover's job is recognition, and re-ordering it by who spoke
  // last would reshuffle the shelf mid-scene.
  // A playthrough-local `character.avatarFile` takes precedence over the global library portrait
  // so story-generated characters (and characters whose portrait evolved in play) appear in the collage.
  const activeSet = new Set(p.activeCharacters ?? []);
  const present = p.characters.filter((character) =>
    activeSet.has(character.id),
  );
  const libraryPortraits = new Map(
    resolveCharacterPortraits(
      present
        .map((character) => character.templateId)
        .filter((id): id is string => Boolean(id)),
      options.charactersDir,
    ).map((entry) => [entry.id, entry]),
  );

  const resolvedCast: Array<{
    id: string;
    name: string;
    avatarUpdatedAt?: number;
    avatarFile?: string;
  }> = [];

  for (const character of present) {
    if (
      character.avatarFile &&
      imageFilePath(
        character.avatarFile,
        options.imagesDir,
        options.dataDir,
        p.id,
      )
    ) {
      resolvedCast.push({
        id: character.templateId ?? character.id,
        name: character.name,
        avatarFile: character.avatarFile,
      });
      continue;
    }
    if (character.templateId) {
      const libPortrait = libraryPortraits.get(character.templateId);
      if (libPortrait) {
        resolvedCast.push({
          id: libPortrait.id,
          name: character.name,
          ...(libPortrait.avatarUpdatedAt === undefined
            ? {}
            : { avatarUpdatedAt: libPortrait.avatarUpdatedAt }),
        });
      }
    }
  }

  if (resolvedCast.length > 0) {
    return {
      source: "cast",
      characterCount: resolvedCast.length,
      characters: resolvedCast.slice(0, COVER_COLLAGE_LIMIT),
    };
  }

  return null;
}
