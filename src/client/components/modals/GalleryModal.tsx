import { useState } from "react";
import { buildImageUrl } from "../../api";
import type { CoverMediaItem } from "../../engine/coverMedia";
import { Badge, Button, Icon } from "../base";
import { ImageViewer } from "../common/ImageViewer";

export type GalleryModalProps = {
  playthroughName: string;
  /** The story's images, newest first. The caller builds this — the modal never reads the
   *  playthrough, so a second entry point can feed it from anywhere. */
  media: CoverMediaItem[];
  /** The file the player picked, when the cover is a manual choice. Only a manual pick can be
   *  badged: the automatic chain is resolved server-side for the LIST, and this modal is opened
   *  from inside a playthrough, which carries the stored choice rather than the resolved one. */
  currentFile?: string;
  hasManualCover: boolean;
  saving?: boolean;
  /** Why the last write failed, shown in place — this modal is the only error surface the
   *  journal has. */
  errorMessage?: string;
  /** `fit` is omitted for the default (the whole image, fitted over a blurred fill of itself). */
  onPick: (file: string, fit?: "contain" | "cover") => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Every generated image in the story, with the two ways to wear one.
 *
 * Two actions rather than one, because "fit" and "fill" are genuinely different covers and the
 * choice belongs to the image the player is looking at: Fit keeps the whole image over a blurred
 * fill of itself, Fill lets the edges fall off the frame.
 */
export function GalleryModal({
  playthroughName,
  media,
  currentFile,
  hasManualCover,
  saving = false,
  errorMessage,
  onPick,
  onClear,
  onClose
}: GalleryModalProps) {
  const [viewing, setViewing] = useState<CoverMediaItem | null>(null);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <section
          className="modal gallery-modal"
          onClick={(e) => e.stopPropagation()}
          aria-label="Gallery media"
        >
          <header className="modal-header">
            <div>
              <h2>Gallery Media</h2>
              <p>
                {media.length === 0
                  ? "No images in this playthrough yet."
                  : `${media.length} ${media.length === 1 ? "image" : "images"} from ${playthroughName}. ` +
                    (hasManualCover
                      ? "The cover is your pick below."
                      : "The cover follows the latest image automatically.")}
              </p>
              {errorMessage ? <p className="gallery-modal-error">{errorMessage}</p> : null}
            </div>
            <div className="gallery-modal-header-actions">
              {hasManualCover ? (
                <Button variant="secondary" size="sm" onClick={onClear} disabled={saving}>
                  Clear custom cover
                </Button>
              ) : null}
              <button
                className="flex items-center gap-1 modal-close-btn"
                onClick={onClose}
                aria-label="Close gallery"
              >
                <Icon name="X" size={14} /> Close
              </button>
            </div>
          </header>

          {media.length === 0 ? (
            <p className="info-empty-state">
              Images generated from the chat are collected here, newest first. Generate one from an
              assistant message and it becomes both a cover and a choice.
            </p>
          ) : (
            <div className="gallery-grid">
              {media.map((item) => (
                <figure key={item.file} className={`gallery-item ${currentFile === item.file ? "current" : ""}`}>
                  <button
                    type="button"
                    className="gallery-item-thumb"
                    onClick={() => setViewing(item)}
                    title={item.prompt || "View image"}
                    aria-label="View image full size"
                  >
                    <img
                      src={buildImageUrl(item.file)}
                      alt={item.prompt.slice(0, 120)}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                  <figcaption className="gallery-item-meta">
                    {currentFile === item.file ? <Badge variant="accent" size="xs" pill>Cover</Badge> : null}
                    <span className="gallery-item-when">
                      {item.chapterName ? `${item.chapterName} · ` : ""}
                      {item.turn !== undefined ? `Turn ${item.turn} · ` : ""}
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </span>
                  </figcaption>
                  <div className="gallery-item-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving}
                      onClick={() => onPick(item.file)}
                    >
                      Use as cover
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      title="Fill the frame and let the image's edges fall off"
                      onClick={() => onPick(item.file, "cover")}
                    >
                      Fill
                    </Button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      <ImageViewer
        image={
          viewing
            ? {
                src: buildImageUrl(viewing.file),
                alt: viewing.prompt.slice(0, 120),
                title: viewing.prompt,
                caption: [
                  viewing.chapterName,
                  viewing.turn !== undefined ? `Turn ${viewing.turn}` : undefined,
                  new Date(viewing.createdAt).toLocaleString()
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
            : null
        }
        onClose={() => setViewing(null)}
      />
    </>
  );
}
