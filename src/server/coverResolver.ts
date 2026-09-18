/** Which image a playthrough card wears, and why.
 *
 *  The chain, highest priority first:
 *
 *    1. `manual`  — the player picked it in the gallery. A pointer whose file has since
 *                   disappeared falls through rather than rendering broken, so a stale
 *                   choice self-heals instead of blanking the card.
 *    2. `latest`  — the newest image the story has produced.
 *    3. `cast`    — a collage of the PRESENT cast's portraits (the same presence rule the
 *                   prompt builder uses: `currentLocationId === locationId`), capped.
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
  /** Injectable seam for the character library, where cast portraits live. Defaults to the
   *  real library directory. */
  charactersDir?: string;
};

export function resolvePlaythroughCover(
  p: Playthrough,
  options: CoverResolverOptions
): PlaythroughCoverView | null {
  const manualFile = p.cover?.file;
  if (manualFile && imageFilePath(manualFile, options.imagesDir)) {
    return { source: "manual", file: manualFile, fit: p.cover?.fit ?? "contain" };
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
      if (file && imageFilePath(file, options.imagesDir)) return { source: "latest", file };
    }
  }

  // Cast order, not recency: a cover's job is recognition, and re-ordering it by who spoke
  // last would reshuffle the shelf mid-scene.
  const present = p.characters.filter((character) => character.currentLocationId === p.locationId);
  const portraits = resolveCharacterPortraits(
    present.map((character) => character.templateId),
    options.charactersDir
  );
  if (portraits.length > 0) {
    const nameById = new Map(present.map((character) => [character.templateId, character.name]));
    return {
      source: "cast",
      characterCount: portraits.length,
      characters: portraits.slice(0, COVER_COLLAGE_LIMIT).map((portrait) => ({
        id: portrait.id,
        name: nameById.get(portrait.id) ?? "",
        ...(portrait.avatarUpdatedAt === undefined ? {} : { avatarUpdatedAt: portrait.avatarUpdatedAt })
      }))
    };
  }

  return null;
}
