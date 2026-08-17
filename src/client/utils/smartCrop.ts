/**
 * smartCrop.ts
 * 
 * Intelligent focal detection and automated 1:1 square cropping for character artwork,
 * illustrations, and cards in BobbinLoom.
 * 
 * Combines edge gradient density, skin/face hue affinity, and composition-aware
 * spatial priors (e.g. top-third portrait bias) to identify character faces and heads.
 */

export type SmartCropResult = {
  focusX: number; // 0..1 normalized horizontal focal center
  focusY: number; // 0..1 normalized vertical focal center
  zoom: number;   // Recommended zoom factor (1.0 .. 3.0)
  offsetX: number; // CropModal offset X in viewport px
  offsetY: number; // CropModal offset Y in viewport px
  cropBox: {
    x: number;
    y: number;
    size: number;
  };
};

/**
 * Load an image from URL into an HTMLImageElement with crossOrigin set.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for smart cropping."));
    img.src = src;
  });
}

/**
 * Analyze an image and compute the optimal 1:1 focal center and zoom.
 * 
 * @param imageElementOrSrc HTMLImageElement or image URL string
 * @param viewportSize Interactive crop viewport size in px (defaults to 320 for BobbinLoom's ImageCropModal)
 */
export async function detectSmartCrop(
  imageElementOrSrc: HTMLImageElement | string,
  viewportSize = 320
): Promise<SmartCropResult> {
  const img = typeof imageElementOrSrc === "string"
    ? await loadImage(imageElementOrSrc)
    : imageElementOrSrc;

  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;
  const aspectRatio = naturalH / naturalW; // > 1 for tall portraits, < 1 for landscape

  // Downscale image for fast canvas saliency analysis (< 15ms)
  const sampleW = 160;
  const sampleH = Math.max(32, Math.min(320, Math.round(sampleW * aspectRatio)));

  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let focusX = 0.5;
  let focusY = aspectRatio > 1.2 ? 0.22 : 0.35; // Default heuristic fallback

  if (ctx) {
    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    // Build saliency score grid
    const scores = new Float32Array(sampleW * sampleH);
    let maxScore = 0;

    // Compute luminance
    const lum = new Float32Array(sampleW * sampleH);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    }

    for (let y = 1; y < sampleH - 1; y++) {
      const normY = y / sampleH;

      // Vertical spatial prior:
      // Tall portrait (2:3, 1:2): Head is usually in upper 12% - 38%
      // Square/Landscape: Head is usually around 20% - 45%
      let vPrior: number;
      if (aspectRatio >= 1.25) {
        // Peak around y = 0.22
        const dist = normY - 0.22;
        vPrior = Math.exp(-(dist * dist) / 0.04);
      } else if (aspectRatio >= 0.9) {
        // Peak around y = 0.32
        const dist = normY - 0.32;
        vPrior = Math.exp(-(dist * dist) / 0.06);
      } else {
        // Landscape, peak around y = 0.38
        const dist = normY - 0.38;
        vPrior = Math.exp(-(dist * dist) / 0.08);
      }

      for (let x = 1; x < sampleW - 1; x++) {
        const normX = x / sampleW;
        // Horizontal center prior (characters are usually somewhat horizontally centered)
        const hDist = normX - 0.5;
        const hPrior = Math.exp(-(hDist * hDist) / 0.12);

        const idx = y * sampleW + x;
        const pIdx = idx * 4;
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];

        // 1. High frequency edge gradient (Sobel-like magnitude)
        const dx = lum[idx + 1] - lum[idx - 1];
        const dy = lum[idx + sampleW] - lum[idx - sampleW];
        const edge = Math.sqrt(dx * dx + dy * dy);

        // 2. Skin / Face hue affinity check for anime & illustrative artwork
        // Warm tones where R > G and R > B, avoiding pure white/black
        let skinBoost = 1.0;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const diff = maxC - minC;
        if (r > 60 && g > 40 && b > 20 && r > g && g >= b && diff > 15 && diff < 160) {
          skinBoost = 1.6;
        }

        const score = (edge * 2.2 + 0.15) * skinBoost * vPrior * hPrior;
        scores[idx] = score;
        if (score > maxScore) {
          maxScore = score;
        }
      }
    }

    // Find center-of-mass around the top salient regions
    if (maxScore > 0.05) {
      const threshold = maxScore * 0.45;
      let totalMass = 0;
      let sumX = 0;
      let sumY = 0;

      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const s = scores[y * sampleW + x];
          if (s >= threshold) {
            const w = Math.pow(s / maxScore, 2);
            totalMass += w;
            sumX += (x / sampleW) * w;
            sumY += (y / sampleH) * w;
          }
        }
      }

      if (totalMass > 0) {
        focusX = sumX / totalMass;
        focusY = sumY / totalMass;
      }
    }
  }

  // Calculate recommended zoom factor so the face/head nicely occupies ~45-55% of the 1:1 frame:
  // For tall full-body cards (e.g. aspectRatio ~ 1.5 - 2.0), zoom in to ~1.45x - 1.75x.
  // For close bust shots or square cards, zoom can remain ~1.05x - 1.25x.
  let zoom: number;
  if (aspectRatio >= 1.6) {
    zoom = 1.6;
  } else if (aspectRatio >= 1.3) {
    zoom = 1.4;
  } else if (aspectRatio >= 1.1) {
    zoom = 1.2;
  } else if (aspectRatio <= 0.8) {
    zoom = 1.25;
  } else {
    zoom = 1.1;
  }

  // Calculate crop rectangle on natural dimensions
  const baseDim = Math.min(naturalW, naturalH);
  const cropSize = Math.max(64, Math.round(baseDim / zoom));

  const rawCropX = Math.round(naturalW * focusX - cropSize / 2);
  const rawCropY = Math.round(naturalH * focusY - cropSize / 2);

  const clampedCropX = Math.max(0, Math.min(naturalW - cropSize, rawCropX));
  const clampedCropY = Math.max(0, Math.min(naturalH - cropSize, rawCropY));

  // Compute offset X and offset Y for ImageCropModal viewport
  const baseScale = Math.max(viewportSize / naturalW, viewportSize / naturalH);
  const currentScale = baseScale * zoom;
  const scaledW = naturalW * currentScale;
  const scaledH = naturalH * currentScale;

  const maxOffsetX = Math.max(0, (scaledW - viewportSize) / 2);
  const maxOffsetY = Math.max(0, (scaledH - viewportSize) / 2);

  // In viewport space, setting offset = scaled * (0.5 - focus) centers the focal point
  const targetOffsetX = scaledW * (0.5 - focusX);
  const targetOffsetY = scaledH * (0.5 - focusY);

  const clampedOffsetX = Math.round(Math.max(-maxOffsetX, Math.min(maxOffsetX, targetOffsetX)));
  const clampedOffsetY = Math.round(Math.max(-maxOffsetY, Math.min(maxOffsetY, targetOffsetY)));

  return {
    focusX,
    focusY,
    zoom,
    offsetX: clampedOffsetX,
    offsetY: clampedOffsetY,
    cropBox: {
      x: clampedCropX,
      y: clampedCropY,
      size: cropSize,
    },
  };
}

/**
 * Generate a high-resolution 512x512 PNG base64 string from the auto-detected crop.
 * 
 * @param imageSrc Source portrait image URL / data URL
 * @param outputSize Desired square output dimension (default 512px)
 * @returns Clean base64 string without data:image/png;base64, prefix
 */
export async function generateAutoCropBase64(
  imageSrc: string,
  outputSize = 512
): Promise<string> {
  const img = await loadImage(imageSrc);
  const cropResult = await detectSmartCrop(img);

  const { x, y, size } = cropResult.cropBox;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;

  const ctx = outCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas 2D rendering context.");
  }

  // Draw the cropped region scaled into 512x512
  ctx.drawImage(img, x, y, size, size, 0, 0, outputSize, outputSize);

  const dataUrl = outCanvas.toDataURL("image/png");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
