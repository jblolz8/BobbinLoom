import { useMemo, useState } from "react";
import type { Chapter } from "../../../schemas";
import { buildImageUrl } from "../../api";
import { groupCoverMedia, type CoverMediaItem } from "../../engine/coverMedia";
import { useSideNavMode } from "../../hooks/useSideNavMode";
import { Badge, Button, Icon, IconButton, SideNav } from "../base";
import { ImageViewer } from "../common/ImageViewer";

export type GalleryModalProps = {
  playthroughName: string;
  /** The story's images, newest first, archived chapters included. The caller builds this — the
   *  modal never reads the playthrough, so a second entry point can feed it from anywhere. */
  media: CoverMediaItem[];
  /** The story's chapter records, for the section list. A prop rather than a read, for the same
   *  reason `media` is. */
  chapters: Chapter[];
  /** The file the player picked, when the cover is a manual choice. Only a manual pick can be
   *  badged: the automatic chain is resolved server-side for the LIST, and this modal is opened
   *  from inside a playthrough, which carries the stored choice rather than the resolved one. */
  currentFile?: string;
  hasManualCover: boolean;
  saving?: boolean;
  /** Why the last write failed, shown in place — this modal is the only error surface the
   *  journal has. */
  errorMessage?: string;
  /** `fit` is gone: how a cover is shaped and filled is a display setting, not a property of a
   *  choice, so the choice is only ever which file. */
  onPick: (file: string) => void;
  onClear: () => void;
  onClose: () => void;
};

/**
 * Every generated image in the story — archived chapters included — sectioned by chapter and
 * browsed through the same side nav the docs viewer uses.
 *
 * The nav is one section per chapter because a long story's gallery is the list that grows
 * without bound: the running chapter first, closed chapters newest-first, and **All images** to
 * see the story whole. On a phone that nav is the same drawer, and this dialog is a full-screen
 * sheet.
 */
export function GalleryModal({
  playthroughName,
  media,
  chapters,
  currentFile,
  hasManualCover,
  saving = false,
  errorMessage,
  onPick,
  onClear,
  onClose
}: GalleryModalProps) {
  const [viewing, setViewing] = useState<CoverMediaItem | null>(null);
  /** "all", "current", or a chapter id. */
  const [selected, setSelected] = useState("all");
  const nav = useSideNavMode();

  const groups = useMemo(() => groupCoverMedia(media, chapters), [media, chapters]);
  const visible =
    selected === "all"
      ? media
      : groups.find((group) => group.chapterId === selected)?.items ??
        (selected === "current" ? groups[0]?.items ?? [] : media);
  const selectedName =
    selected === "all"
      ? "All images"
      : groups.find((group) => group.chapterId === selected)?.name ?? "Images";

  const sections = [
    { label: "Everything", items: [{ id: "all", label: "All images", meta: `${media.length}` }] },
    {
      label: "By chapter",
      items: groups
        .filter((group) => group.items.length > 0)
        .map((group) => ({
          id: group.chapterId ?? "current",
          label: group.name,
          meta: `${group.items.length}`
        }))
    }
  ];

  function choose(id: string) {
    setSelected(id);
    // On a phone the drawer is a temporary overlay: choosing a section dismisses it.
    if (nav.narrow) nav.closeDrawer();
  }

  return (
    <>
      <div className="modal-backdrop gallery-backdrop" onClick={onClose}>
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
                  ? "No images in this story yet."
                  : `${media.length} ${media.length === 1 ? "image" : "images"} from ${playthroughName}, every chapter included. ` +
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
              Images generated from the chat are collected here, newest first and grouped by
              chapter. Generate one from an assistant message and it becomes both a cover and a
              choice.
            </p>
          ) : (
            <div className="gallery-body">
              {/* The control that hides the nav lives HERE, in the pane that is never hidden:
                  a toggle inside the nav it collapses is gone the instant it works, and one
                  inside the translated drawer is off-canvas. */}
              <div className="gallery-toolbar">
                <IconButton
                  icon={nav.shown ? "PanelLeftClose" : "PanelLeft"}
                  size="sm"
                  label={nav.shown ? "Hide the chapter list" : "Show the chapter list"}
                  aria-expanded={nav.shown}
                  aria-controls="gallery-nav"
                  onClick={nav.toggle}
                />
                <span className="gallery-toolbar-title">{selectedName}</span>
                <span className="gallery-toolbar-count">
                  {visible.length} {visible.length === 1 ? "image" : "images"}
                </span>
              </div>

              <div className="gallery-panes">
                <SideNav
                  id="gallery-nav"
                  ariaLabel="Gallery chapters"
                  title={
                    <>
                      <Icon name="Images" size={16} /> Chapters
                    </>
                  }
                  sections={sections}
                  activeId={selected}
                  onSelect={choose}
                  hidden={!nav.narrow && nav.collapsed}
                  open={nav.narrow && nav.drawerOpen}
                  showScrim={nav.narrow && nav.drawerOpen}
                  onScrimClick={nav.closeDrawer}
                  emptyLabel="No images yet."
                />

                <div className="gallery-grid">
                  {visible.map((item) => (
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
                      </div>
                    </figure>
                  ))}
                </div>
              </div>
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
