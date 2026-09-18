import type { PlaythroughCoverView } from "../../../schemas";
import { buildImageUrl, getCharacterAvatarUrl } from "../../api";
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
 * - a single image, FILLING its frame — no letterboxing, because the frame's shape follows the
 *   Cover Art setting (Settings → Theme & Appearance) rather than the other way round;
 * - a collage of the present cast's portraits, in cast order, each shown whole over a blurred
 *   copy of itself, with a count chip for the characters that did not fit;
 * - the monochrome bobbin mark, for a story with no art at all.
 *
 * The frame's shape is NOT a prop: it comes from `--cover-art-aspect`, which the app sets on the
 * root from the display setting, so one value shapes every cover on every surface. In the list
 * the frame is height-driven instead (the row decides how tall it is) and derives its width from
 * the same value — see `.cover-art-thumb`.
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
        {tiles.map((tile) => {
          const src = getCharacterAvatarUrl(tile.id, "portrait", tile.avatarUpdatedAt);
          return (
            <div key={tile.id} className="cover-art-tile">
              {/* The same URL as the avatar below it: one request, and it fails silently behind a
                  character whose library entry is gone (the avatar's letter fallback covers that). */}
              <img className="cover-art-tile-blur" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <CharacterAvatar
                template={{ id: tile.id, name: tile.name, avatarUpdatedAt: tile.avatarUpdatedAt }}
                variant="cover-tile"
                type="portrait"
                alt={tile.name}
              />
            </div>
          );
        })}
        {hidden > 0 ? <span className="cover-art-more">+{hidden}</span> : null}
      </div>
    );
  }

  return (
    <div className={frame}>
      <img
        className="cover-art-main"
        src={buildImageUrl(cover.file as string)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
