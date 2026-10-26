import type { CoverAspect, PlaythroughCoverView } from "../../../../schemas";
import { buildImageUrl, getCharacterAvatarUrl } from "../../../api";
import { CharacterAvatar } from "../CharacterAvatar/CharacterAvatar";
import { Icon } from "../Icon/Icon";
import { ThreadIcon } from "../ThreadIcon/ThreadIcon";
import "./CoverArt.css";

export type CoverArtSize = "card" | "thumb" | "hero";

export interface CoverAspectPreviewProps {
  aspect: CoverAspect;
}

/** Miniature aspect-ratio frame preview for cover art selection controls. */
export function CoverAspectPreview({ aspect }: CoverAspectPreviewProps) {
  return (
    <span
      className="cover-aspect-preview"
      data-aspect={aspect}
      aria-hidden="true"
    >
      <Icon name="Image" size={13} />
    </span>
  );
}

export type CoverArtProps = {
  /** The resolved cover from the list projection, or null for the placeholder. */
  cover: PlaythroughCoverView | null;
  size?: CoverArtSize;
  className?: string;
};

export function CoverArt({
  cover,
  size = "card",
  className = "",
}: CoverArtProps) {
  const frame = ["cover-art", `cover-art-${size}`, className]
    .filter(Boolean)
    .join(" ");

  if (!cover || (cover.source !== "cast" && !cover.file)) {
    return (
      <div
        className={`${frame} cover-art-empty`}
        role="img"
        aria-label="No cover art yet"
      >
        <ThreadIcon size={size === "thumb" ? 18 : 32} />
      </div>
    );
  }

  if (cover.source === "cast") {
    const tiles = cover.characters ?? [];
    const hidden = Math.max(
      0,
      (cover.characterCount ?? tiles.length) - tiles.length,
    );
    return (
      <div
        className={`${frame} cover-art-collage cover-art-collage-${tiles.length}`}
        role="img"
        aria-label={tiles
          .map((tile) => tile.name)
          .filter(Boolean)
          .join(", ")}
      >
        {tiles.map((tile) => {
          const src = getCharacterAvatarUrl(
            tile.id,
            "portrait",
            tile.avatarUpdatedAt,
          );
          return (
            <div key={tile.id} className="cover-art-tile">
              <img
                className="cover-art-tile-blur"
                src={src}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
              <CharacterAvatar
                template={{
                  id: tile.id,
                  name: tile.name,
                  avatarUpdatedAt: tile.avatarUpdatedAt,
                }}
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
