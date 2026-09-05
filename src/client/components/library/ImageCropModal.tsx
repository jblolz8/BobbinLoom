import { useEffect, useRef, useState, useCallback } from "react";
import type { AvatarShape } from "../../../schemas";
import { Button, Icon } from "../base";
import { detectSmartCrop } from "../../utils/smartCrop";

export type ImageCropModalProps = {
  imageSrc: string;
  characterName: string;
  onApply: (dataBase64: string) => void;
  onClose: () => void;
  loading?: boolean;
};

const VIEWPORT_SIZE = 320; // Size of the interactive crop box in pixels

export function ImageCropModal({
  imageSrc,
  characterName,
  onApply,
  onClose,
  loading = false,
}: ImageCropModalProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const [activeShape] = useState<AvatarShape>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_avatar_shape");
      if (saved === "square" || saved === "rounded" || saved === "circle") return saved;
    }
    return "rounded";
  });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const squarePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const roundedPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const circlePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  // Load the source image
  useEffect(() => {
    setImageLoaded(false);
    setLoadError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      setLoadError("Failed to load source image for cropping.");
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Compute clamped offset and scaled dimensions
  const getRenderParams = useCallback(() => {
    const img = imageRef.current;
    if (!img) return null;

    const baseScale = Math.max(VIEWPORT_SIZE / img.naturalWidth, VIEWPORT_SIZE / img.naturalHeight);
    const currentScale = baseScale * zoom;

    const scaledW = img.naturalWidth * currentScale;
    const scaledH = img.naturalHeight * currentScale;

    const maxOffsetX = Math.max(0, (scaledW - VIEWPORT_SIZE) / 2);
    const maxOffsetY = Math.max(0, (scaledH - VIEWPORT_SIZE) / 2);

    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offset.x));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offset.y));

    const drawX = (VIEWPORT_SIZE - scaledW) / 2 + clampedX;
    const drawY = (VIEWPORT_SIZE - scaledH) / 2 + clampedY;

    return {
      img,
      scaledW,
      scaledH,
      drawX,
      drawY,
      clampedX,
      clampedY,
    };
  }, [zoom, offset]);

  // Redraw both viewport canvas and side previews
  const redraw = useCallback(() => {
    const params = getRenderParams();
    if (!params) return;

    const { img, scaledW, scaledH, drawX, drawY } = params;

    // 1. Draw interactive viewport canvas
    const vpCanvas = viewportCanvasRef.current;
    if (vpCanvas) {
      vpCanvas.width = VIEWPORT_SIZE;
      vpCanvas.height = VIEWPORT_SIZE;
      const ctx = vpCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
        ctx.drawImage(img, drawX, drawY, scaledW, scaledH);
      }
    }

    // Helper to draw scaled image to canvas
    const drawToCanvas = (canvas: HTMLCanvasElement | null, size: number, clipCircle = false) => {
      if (!canvas) return;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      const ratio = size / VIEWPORT_SIZE;
      if (clipCircle) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, drawX * ratio, drawY * ratio, scaledW * ratio, scaledH * ratio);
        ctx.restore();
      } else {
        ctx.drawImage(img, drawX * ratio, drawY * ratio, scaledW * ratio, scaledH * ratio);
      }
    };

    // Draw active shape preview (84x84)
    drawToCanvas(activePreviewCanvasRef.current, 84, activeShape === "circle");
    // Draw mini comparison shape previews (36x36)
    drawToCanvas(squarePreviewCanvasRef.current, 36);
    drawToCanvas(roundedPreviewCanvasRef.current, 36);
    drawToCanvas(circlePreviewCanvasRef.current, 36, true);
  }, [getRenderParams, activeShape]);

  useEffect(() => {
    if (imageLoaded) {
      redraw();
    }
  }, [imageLoaded, redraw]);

  // Mouse pan handlers
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialOffsetRef.current = { ...offset };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: initialOffsetRef.current.x + dx,
      y: initialOffsetRef.current.y + dy,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Mouse wheel zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.min(4.0, Math.max(1.0, Number((z + delta).toFixed(2)))));
  }

  // Touch handlers for mobile
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      initialOffsetRef.current = { ...offset };
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceRef.current = Math.hypot(dx, dy);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setOffset({
        x: initialOffsetRef.current.x + dx,
        y: initialOffsetRef.current.y + dy,
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const factor = newDist / touchDistanceRef.current;
      setZoom((z) => Math.min(4.0, Math.max(1.0, Number((z * factor).toFixed(2)))));
      touchDistanceRef.current = newDist;
    }
  }

  function handleTouchEnd() {
    setIsDragging(false);
    touchDistanceRef.current = null;
  }

  // Generate high-resolution 512x512 final cropped image
  function handleApplyCrop() {
    const params = getRenderParams();
    if (!params || !imageLoaded) return;

    const { img, scaledW, scaledH, drawX, drawY } = params;
    const outCanvas = document.createElement("canvas");
    const outSize = 512;
    outCanvas.width = outSize;
    outCanvas.height = outSize;

    const ctx = outCanvas.getContext("2d");
    if (!ctx) return;

    const ratio = outSize / VIEWPORT_SIZE;
    ctx.drawImage(img, drawX * ratio, drawY * ratio, scaledW * ratio, scaledH * ratio);

    const dataUrl = outCanvas.toDataURL("image/png");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    onApply(base64);
  }

  const [detecting, setDetecting] = useState(false);

  const handleAutoDetect = useCallback(async () => {
    if (!imageRef.current) return;
    setDetecting(true);
    try {
      const result = await detectSmartCrop(imageRef.current, VIEWPORT_SIZE);
      setZoom(result.zoom);
      setOffset({ x: result.offsetX, y: result.offsetY });
    } catch {
      // Fallback to top-center bias if detection fails
      setZoom(1.4);
      setOffset({ x: 0, y: Math.round(VIEWPORT_SIZE * 0.2) });
    } finally {
      setDetecting(false);
    }
  }, []);

  function handleReset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <section className="modal image-crop-modal" aria-labelledby="crop-modal-title">
        <header className="modal-header">
          <div className="crop-modal-title-wrap">
            <span className="crop-modal-icon-badge">
              <Icon name="Scissors" size={18} />
            </span>
            <div>
              <h3 id="crop-modal-title">Crop 1:1 Profile Avatar</h3>
              <p className="modal-subtitle">Drag to frame face, scroll or slide to zoom: {characterName}</p>
            </div>
          </div>
          <button
            type="button"
            className="diff-close-btn"
            onClick={onClose}
            disabled={loading}
            title="Close dialog"
            aria-label="Close dialog"
          >
            <Icon name="X" size={16} />
          </button>
        </header>

        <div className="image-crop-body">
          {loadError ? (
            <div className="crop-error-msg">
              <Icon name="AlertTriangle" size={16} />
              <span>{loadError}</span>
            </div>
          ) : !imageLoaded ? (
            <div className="crop-loading-box">
              <Icon name="Sparkles" size={20} className="sparkle-pulse" />
              <span>Loading portrait artwork…</span>
            </div>
          ) : (
            <div className="crop-workspace">
              {/* Interactive Viewport */}
              <div className="crop-viewport-container">
                <div
                  className={`crop-box-viewport ${isDragging ? "is-dragging" : ""}`}
                  style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <canvas ref={viewportCanvasRef} className="crop-viewport-canvas" />

                  {/* Corner framing brackets */}
                  <div className="crop-bracket corner-tl" />
                  <div className="crop-bracket corner-tr" />
                  <div className="crop-bracket corner-bl" />
                  <div className="crop-bracket corner-br" />

                  {/* Rule of thirds grid lines */}
                  <div className="crop-grid-overlay">
                    <div className="grid-line horizontal h1" />
                    <div className="grid-line horizontal h2" />
                    <div className="grid-line vertical v1" />
                    <div className="grid-line vertical v2" />
                  </div>
                </div>

                {/* Zoom & Centering Controls */}
                <div className="crop-zoom-bar">
                  <button
                    type="button"
                    className="zoom-step-btn"
                    onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.1).toFixed(2))))}
                    title="Zoom Out"
                  >
                    <Icon name="Minus" size={12} />
                  </button>
                  <input
                    type="range"
                    min={1.0}
                    max={4.0}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="crop-zoom-slider"
                  />
                  <button
                    type="button"
                    className="zoom-step-btn"
                    onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.1).toFixed(2))))}
                    title="Zoom In"
                  >
                    <Icon name="Plus" size={12} />
                  </button>
                  <span className="zoom-val">{Math.round(zoom * 100)}%</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    className="crop-auto-detect-btn"
                    onClick={handleAutoDetect}
                    disabled={!imageLoaded || detecting || loading}
                    title="Auto-detect face and center crop"
                    leftIcon={<Icon name="Sparkles" size={12} className={detecting ? "sparkle-pulse" : ""} />}
                  >
                    Auto-Detect
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    className="crop-reset-btn"
                    onClick={handleReset}
                    title="Reset to center and 100% zoom"
                    leftIcon={<Icon name="RotateCcw" size={12} />}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Side live preview panels */}
              <div className="crop-previews-column">
                <span className="preview-heading">Avatar Previews</span>
                <div className="crop-preview-items">
                  {/* Primary Active Preference Preview */}
                  <div className="preview-item main-preview">
                    <div className="preview-thumb-wrap global is-active-shape">
                      <canvas ref={activePreviewCanvasRef} className="preview-canvas" />
                    </div>
                    <span className="preview-caption">
                      Active: {activeShape}
                    </span>
                  </div>

                  {/* Tri-Shape Comparative Preview */}
                  <div className="preview-shapes-row">
                    <div className={`mini-preview-item ${activeShape === "square" ? "is-selected" : ""}`} title="Square Avatar">
                      <div className="preview-thumb-wrap square mini">
                        <canvas ref={squarePreviewCanvasRef} className="preview-canvas" />
                      </div>
                      <span className="preview-sub-caption">Square</span>
                    </div>

                    <div className={`mini-preview-item ${activeShape === "rounded" ? "is-selected" : ""}`} title="Rounded Avatar">
                      <div className="preview-thumb-wrap rounded mini">
                        <canvas ref={roundedPreviewCanvasRef} className="preview-canvas" />
                      </div>
                      <span className="preview-sub-caption">Rounded</span>
                    </div>

                    <div className={`mini-preview-item ${activeShape === "circle" ? "is-selected" : ""}`} title="Circle Avatar">
                      <div className="preview-thumb-wrap circle mini">
                        <canvas ref={circlePreviewCanvasRef} className="preview-canvas" />
                      </div>
                      <span className="preview-sub-caption">Circle</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-actions crop-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="crop-apply-btn"
            onClick={handleApplyCrop}
            disabled={!imageLoaded || loading}
            leftIcon={<Icon name="Check" size={14} />}
          >
            {loading ? "Saving Profile Avatar…" : "Apply Profile Avatar"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
