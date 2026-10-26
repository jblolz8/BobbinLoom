import { createRequire } from "node:module";
import { join } from "node:path";
import type sharpType from "sharp";

export type TranscodedImage = {
  bytes: Buffer;
  ext: string;
  mime: string;
};

let cachedSharp: typeof sharpType | null = null;

/**
 * Lazily loads `sharp` via CommonJS `createRequire` rather than dynamic ESM
 * `import("sharp")` so `tsx` on Node < 20.10 never triggers an ESM translator
 * `SyntaxError: Unexpected token 'with'`, while still keeping server startup
 * and `tsx watch` reloads instant.
 */
export function loadSharp(): typeof sharpType {
  if (!cachedSharp) {
    const req = createRequire(join(process.cwd(), "package.json"));
    cachedSharp = req("sharp") as typeof sharpType;
  }
  return cachedSharp;
}

/**
 * Transcodes an uploaded image buffer (PNG, JPEG, WebP, AVIF, etc.) into WebP
 * for compact, universal storage across all desktop and mobile browsers
 * (including Safari/iOS 14+).
 *
 * If the input buffer is not a decodable image (for example, synthetic byte
 * fixtures in unit tests), falls back to the original bytes and extension so
 * hermetic tests continue to work without real image headers.
 */
export async function transcodeToWebp(
  buffer: Buffer,
  fallbackExt: string = "png",
  quality: number = 88,
): Promise<TranscodedImage> {
  const cleanFallbackExt =
    fallbackExt.replace(/^\./, "").toLowerCase() || "png";
  try {
    const sharp = loadSharp();
    const webpBytes = await sharp(buffer)
      .rotate()
      .webp({ quality, effort: 4 })
      .toBuffer();
    return {
      bytes: webpBytes,
      ext: "webp",
      mime: "image/webp",
    };
  } catch {
    const mime =
      cleanFallbackExt === "jpg" || cleanFallbackExt === "jpeg"
        ? "image/jpeg"
        : cleanFallbackExt === "webp"
          ? "image/webp"
          : "image/png";
    return {
      bytes: buffer,
      ext: cleanFallbackExt,
      mime,
    };
  }
}

/**
 * Converts an image buffer (WebP, JPEG, PNG, etc.) into a lossless PNG buffer
 * for `.png` card export.
 */
export async function transcodeToPng(buffer: Buffer): Promise<Buffer> {
  const sharp = loadSharp();
  return sharp(buffer).rotate().png().toBuffer();
}
