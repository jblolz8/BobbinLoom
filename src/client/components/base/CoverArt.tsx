import type { PlaythroughCoverView } from "../../../schemas";
import { buildImageUrl } from "../../api";
import { CharacterAvatar } from "./CharacterAvatar";
import { ThreadIcon } from "./ThreadIcon";

export type CoverArtSize = "card" | "thumb" | "hero";

export type CoverArtProps = {
  /** The resolved cover from the list projection, or null for the placeholder. */
  cover: PlaythroughCoverView | null;
  size?: CoverArtSize;
  className?: string;
};

/**
 * A playthrough's cover art, in one of three shapes:
 *
 * - a single image, FITTED over a blurred fill of itself so a 2:3 portrait or a square render
 *   never sits on letterbox bars (the same file twice at the same URL — one request, cached);
 * - a collage of the present cast's portraits, in cast order, with a count chip for the rest;
 * - the monochrome bobbin mark, for a story with no art at all.
 *
 * A manual cover may choose to FILL instead (`fit: "cover"`), which drops the blurred fill and
 * lets the image's edges fall off the frame.
 *
 * The bare SVG mark is only ever the placeholder *icon*: the frame behind every variant is the
 * card's own surface, so this reads correctly on any theme without per-theme work.
 */
export function CoverArt({ cover, size = "card", className = "" }: CoverArtProps) {
  const frame = ["cover-art", `cover-art-${size}`, className].filter(Boolean).join(" ");

  if (!cover || (cover.source !== "cast" && !cover.file)) {
    return (
      <div className={`${frame} cover-art-empty`} role="img" aria-label="No cover art yet">
        <ThreadIcon size={size === "thumb" ? 18 : 32} />
      </div>
    );
  }

  if (cover.source === "cast") {
    const tiles = cover.characters ?? [];
    const hidden = Math.max(0, (cover.characterCount ?? tiles.length) - tiles.length);
    return (
      <div
        className={`${frame} cover-art-collage cover-art-collage-${tiles.length}`}
        role="img"
        aria-label={tiles.map((tile) => tile.name).filter(Boolean).join(", ")}
      >
        {tiles.map((tile) => (
          <CharacterAvatar
            key={tile.id}
            template={{ id: tile.id, name: tile.name, avatarUpdatedAt: tile.avatarUpdatedAt }}
            variant="cover-tile"
            type="portrait"
            alt={tile.name}
          />
        ))}
        {hidden > 0 ? <span className="cover-art-more">+{hidden}</span> : null}
      </div>
    );
  }

  const src = buildImageUrl(cover.file as string);
  if (cover.fit === "cover") {
    return (
      <div className={frame}>
        <img className="cover-art-main is-fill" src={src} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className={frame}>
      <img className="cover-art-blur" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <img className="cover-art-main" src={src} alt="" loading="lazy" decoding="async" />
    </div>
  );
}
