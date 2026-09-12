import type { ProviderConnection } from "../../schemas";
import { resolveImageConfig } from "../providerConfig";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";
import { OpenAIImagesProvider } from "./openaiImagesProvider";
import { VeniceImageProvider } from "./veniceImageProvider";

export type { ImageGenerationRequest, ImageGenerationResult, ImageProgress, ImageProvider } from "./types";
export { OPENAI_IMAGE_PROMPT_CAP, OpenAIImagesProvider } from "./openaiImagesProvider";
export { VENICE_IMAGE_PROMPT_CAP, VeniceImageProvider } from "./veniceImageProvider";
export * from "./shared";

/** Pick the dialect from the connection's `apiStyle`. Absent = openai, which is
 *  the conservative default: it never sends a field the endpoint might reject. */
export function createImageProvider(
  conn: ProviderConnection,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): ImageProvider {
  const config = resolveImageConfig(conn, env);
  const apiStyle = conn.apiStyle ?? "openai";
  return apiStyle === "venice"
    ? new VeniceImageProvider(config, conn, fetchImpl)
    : new OpenAIImagesProvider(config, conn, fetchImpl);
}

/** No image connection configured. Throws the same way MockProvider's
 *  unsupported methods do, so the route turns it into a clear 400. */
export class UnconfiguredImageProvider implements ImageProvider {
  async generateImage(_request?: ImageGenerationRequest): Promise<ImageGenerationResult> {
    throw new Error("No image provider configured — add one in Settings → Provider → Images.");
  }
}
