/** The image-generation protocol. Deliberately NOT part of `TurnProvider`:
 *  adding a method there forces a stub into every mock (tsc-visible,
 *  vitest-invisible) for a call that has nothing to do with turns — image
 *  generation never touches the turn counter, snapshots, or the token meter. */

/** Emitted while a slow dialect renders. Best-effort by contract: a dialect
 *  that cannot report progress simply never calls it. */
export type ImageProgress = {
  /** 0..1 across the whole request (a batch reports as one job). */
  progress: number;
  step?: number;
  steps?: number;
  etaSeconds?: number;
};

export type ImageGenerationRequest = {
  prompt: string;
  negativePrompt?: string;
  /** "auto" | "1024x1024" | … — dialect adapters map it (Venice takes width/height). */
  size?: string;
  /** For models that reject width/height (Venice qwen-image family). */
  aspectRatio?: string;
  seed?: number;
  variants?: number;
  safeMode?: boolean;
  stylePreset?: string;
  hideWatermark?: boolean;
  signal?: AbortSignal;
  /** Called while a slow dialect renders. Best-effort: a dialect that cannot
   *  report progress simply never calls it, and a throw here must never fail
   *  the generation. */
  onProgress?: (progress: ImageProgress) => void;
};

export type ImageGenerationResult = {
  images: { bytes: Buffer; mime: string }[];
  model: string;
  providerId: string;
  seed?: number;
  durationMs: number;
  /** Mirrors ProviderTurn.rawInput — the JSON body actually sent. */
  rawRequest: string;
  /** The provider's raw response text. */
  rawOutput: string;
};

export interface ImageProvider {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
