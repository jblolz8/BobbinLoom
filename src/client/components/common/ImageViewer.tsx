import { useEffect, useRef } from "react";
import { Icon } from "../base";

export type ImageViewerImage = {
  /** Whatever the message's own `<img src>` uses — the store's streaming route. */
  src: string;
  alt: string;
  /** The full prompt, as the message's own tooltip carries it. */
  title?: string;
  /** The same caption the message shows under the thumbnail. */
  caption?: string;
};

export type ImageViewerProps = {
  /** The image to show full screen, or `null` for nothing — a caller keeps one
   *  of these mounted and drives it from state rather than mounting one per
   *  image. */
  image: ImageViewerImage | null;
  onClose: () => void;
};

/** One image, as large as the viewport allows.
 *
 *  It opens over everything on the shared `modal-backdrop`, and closes on
 *  Escape, on a backdrop click, and on its own close button — but NOT on a
 *  click on the image itself: a mis-click on the picture is not a request to
 *  dismiss it. The caption is whatever the caller passed, so the full-screen
 *  view shows the same metadata as the thumbnail's. */
export function ImageViewer({ image, onClose }: ImageViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    // Land focus on the close button, so the viewer is dismissable from the
    // keyboard the moment it opens with no tabbing required.
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  function handleBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop image-viewer-backdrop" onMouseDown={handleBackdropMouseDown}>
      <section className="image-viewer" role="dialog" aria-modal="true" aria-label="Image viewer">
        <button
          ref={closeRef}
          type="button"
          className="image-viewer-close"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close the image viewer"
        >
          <Icon name="X" size={16} />
        </button>
        <img className="image-viewer-image" src={image.src} alt={image.alt} title={image.title} />
        {image.caption ? <p className="image-viewer-caption">{image.caption}</p> : null}
      </section>
    </div>
  );
}
