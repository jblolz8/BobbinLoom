import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  isTopDialog,
  popDialog,
  pushDialog,
} from "../../../engine/dialogStack";
import { Badge, IconButton, Stack, Text } from "../../base";
import "./ImageViewer.css";

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
  /** Optional gallery navigation handlers for stepping through a sequence of images. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Optional index counter badge (e.g. `"3 / 18"`). */
  indexLabel?: string;
  /** Optional action controls rendered in the viewer footer (e.g. `"Use as cover"`). */
  actions?: ReactNode;
};

/** One image, as large as the viewport allows.
 *
 *  It opens over everything on its own backdrop, registers on the dialog stack,
 *  and closes on Escape, on a backdrop click, and on its own close button — but
 *  NOT on a click on the image itself: a mis-click on the picture is not a
 *  request to dismiss it. When gallery navigation handlers are passed, Left/Right
 *  arrow keys and overlay buttons step through the collection in place. */
export function ImageViewer({
  image,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  indexLabel,
  actions,
}: ImageViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const isOpen = image !== null;

  useEffect(() => {
    if (!isOpen) return;
    pushDialog(dialogId);
    closeRef.current?.focus();
    return () => popDialog(dialogId);
  }, [isOpen, dialogId]);

  useEffect(() => {
    if (!image) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (!isTopDialog(dialogId)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext && hasNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image, dialogId, onClose, onPrev, onNext, hasPrev, hasNext]);

  if (!image) return null;

  function handleBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget && isTopDialog(dialogId)) {
      onClose();
    }
  }

  const showFooter = Boolean(
    image.caption || image.title || indexLabel || actions,
  );

  return (
    <div
      className="image-viewer-backdrop"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="image-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
      >
        <div className="image-viewer-stage">
          <IconButton
            ref={closeRef}
            className="image-viewer-close"
            variant="overlay"
            size="md"
            round
            icon="X"
            label="Close the image viewer"
            title="Close (Esc)"
            onClick={onClose}
          />
          {onPrev ? (
            <IconButton
              className="image-viewer-nav image-viewer-nav--prev"
              variant="overlay"
              size="md"
              round
              icon="ChevronLeft"
              label="Previous image"
              title="Previous image (←)"
              disabled={!hasPrev}
              onClick={onPrev}
            />
          ) : null}
          <img
            className="image-viewer-image"
            src={image.src}
            alt={image.alt}
            title={image.title}
          />
          {onNext ? (
            <IconButton
              className="image-viewer-nav image-viewer-nav--next"
              variant="overlay"
              size="md"
              round
              icon="ChevronRight"
              label="Next image"
              title="Next image (→)"
              disabled={!hasNext}
              onClick={onNext}
            />
          ) : null}
        </div>
        {showFooter ? (
          <div className="image-viewer-footer">
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="sm"
              wrap
              fullWidth
            >
              <Stack
                direction="column"
                gap="2xs"
                align="start"
                flex1
              >
                <Stack direction="row" align="center" gap="xs" wrap>
                  {indexLabel ? (
                    <Badge variant="neutral" size="xs" pill>
                      {indexLabel}
                    </Badge>
                  ) : null}
                  {image.caption ? (
                    <Text as="p" size="xs" tone="secondary" className="image-viewer-caption">
                      {image.caption}
                    </Text>
                  ) : null}
                </Stack>
                {image.title ? (
                  <Text size="xs" tone="muted" lineClamp={2} title={image.title}>
                    {image.title}
                  </Text>
                ) : null}
              </Stack>
              {actions ? (
                <Stack direction="row" align="center" gap="xs">
                  {actions}
                </Stack>
              ) : null}
            </Stack>
          </div>
        ) : null}
      </section>
    </div>
  );
}
