import { createReadStream } from "node:fs";
import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import { isStubSection, pickSections } from "../../engine/characterSections";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../../engine/imageDefaults";
import type { ChatMessage, ImageGenerationSettings, MessageImage, Playthrough, PromptPreset, ProviderConnection } from "../../schemas";
import { ImageGenerationSettingsSchema } from "../../schemas";
import { OPENAI_IMAGE_PROMPT_CAP, VENICE_IMAGE_PROMPT_CAP } from "../imageProvider";
import { clampChars } from "../imageProvider/shared";
import { imageFilePath, mimeForFile, saveImageBytes, sweepOrphansInDataDir, IMAGES_DIR } from "../imageStore";
import type { ProviderManager } from "../providerManager";
import { generateImagePrompt } from "../provider/imagePrompt";
import { summarizePlaythrough } from "../provider/promptBuilder";
import { getPlaythroughRecord, updatePlaythroughRecord } from "../store";
import { abortOnClientDisconnect, dataDir as defaultDataDir, loadPresets as defaultLoadPresets, providerManager } from "./helpers";

/** Injectable seams (all defaulted) so the routes can be exercised against a
 *  temp data directory with a stub fetch — no test may touch the real store. */
export type ImageRoutesOptions = FastifyPluginOptions & {
  dataDir?: string;
  imagesDir?: string;
  manager?: ProviderManager;
  fetchImpl?: typeof fetch;
  loadPresets?: () => PromptPreset[];
};

const GenerateImageBody = z.object({
  imageProviderId: z.string().optional(),
  promptOverride: z.string().optional(),
  negativeOverride: z.string().optional(),
  seed: z.number().int().optional()
});

const MessageParams = z.object({ id: z.string(), messageId: z.string() });

/** The endpoint's hard prompt cap. Applied to the COMPOSED text so a long
 *  prefix or a long user edit can never 400 the image call. */
function dialectPromptCap(conn: ProviderConnection): number {
  return (conn.apiStyle ?? "openai") === "venice" ? VENICE_IMAGE_PROMPT_CAP : OPENAI_IMAGE_PROMPT_CAP;
}

/** Clamp to BOTH the preset's soft limit and the dialect's hard cap, ignoring a
 *  0 limit (the schema allows it and it reads as "unlimited"). */
function composedLimit(settings: ImageGenerationSettings, conn: ProviderConnection): number {
  return settings.promptCharacterLimit > 0
    ? Math.min(settings.promptCharacterLimit, dialectPromptCap(conn))
    : dialectPromptCap(conn);
}

/** The clamped text plus whether clamping actually cut anything. The cut happens
 *  at the END of the text — where the tag list's action and physical-state tags
 *  live — so the dry-run route warns when it bites. */
function clampComposed(
  text: string,
  settings: ImageGenerationSettings,
  conn: ProviderConnection
): { text: string; truncated: boolean } {
  const clamped = clampChars(text, composedLimit(settings, conn));
  return { text: clamped, truncated: clamped.length < text.length };
}

/** Preset-owned prompt settings, resolved exactly like the rest of the
 *  playthrough snapshot: playthrough copy → preset → shipped defaults. Parsed
 *  (not just copied) so a partial block always comes back complete. */
function resolveImageSettings(playthrough: Playthrough, presets: PromptPreset[]): ImageGenerationSettings {
  const snapshot = playthrough.promptSettings?.imageGeneration;
  if (snapshot) return ImageGenerationSettingsSchema.parse(snapshot);
  const presetId = playthrough.promptSettings?.presetId;
  const preset = presetId ? presets.find((p) => p.id === presetId) : undefined;
  if (preset?.imageGeneration) return ImageGenerationSettingsSchema.parse(preset.imageGeneration);
  return { ...DEFAULT_IMAGE_GENERATION_SETTINGS };
}

/** The stored prompt-call response is capped: a verbose reasoning model can
 *  return tens of thousands of characters and the playthrough record is not the
 *  place for them. The marker keeps the truncation honest — the disclosure
 *  shows it rather than pretending the body ended there. */
const PROMPT_RESPONSE_STORE_CHARS = 4000;

function clampStoredPromptResponse(text: string): string {
  return text.length > PROMPT_RESPONSE_STORE_CHARS
    ? `${text.slice(0, PROMPT_RESPONSE_STORE_CHARS)}\n…[truncated]`
    : text;
}

/** How much of a character sheet's STABLE identity is injected per character.
 *  A few hundred characters: enough for the physical tags the writer must keep
 *  reproducing, not enough for one long sheet to dominate the prompt. */
const CAST_IDENTITY_CHARS = 320;

/** The sheet sections that describe what a camera sees and that the scene does
 *  not change. Deliberately NOT `Clothing`: the character INSTANCE's clothing is
 *  the authoritative current state and already rides on the line above. */
const CAST_IDENTITY_SECTIONS = ["Species", "Gender", "Body", "Appearance"] as const;

/** One character's stable identity, read from their sheet with the engine's own
 *  section parser: the wanted headers in order, stub ("(not established)") and
 *  missing sections skipped, flattened to one bounded line. Empty when the sheet
 *  has nothing physical to say. */
function castIdentity(templateContent: string): string {
  const parts: string[] = [];
  for (const section of pickSections(templateContent, CAST_IDENTITY_SECTIONS)) {
    if (isStubSection(section)) continue;
    const body = section.body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("; ");
    if (body) parts.push(`${section.header}: ${body}`);
  }
  return clampChars(parts.join(" | "), CAST_IDENTITY_CHARS);
}

/** Compact cast block: only characters actually at the current location, plus
 *  the player (who is always in frame). Deliberately short — the scene text is
 *  the primary source and `summarizePlaythrough` already covers world state.
 *
 *  Each present character is described TWICE on purpose: the instance line
 *  (clothing, mood, conditions — the current state) and, when their sheet
 *  resolves, the stable identity line (species, gender, body, appearance). The
 *  writer otherwise scrapes hair/eye/skin out of scene prose, and the same
 *  character comes out looking different in every image. */
function buildCastBlock(playthrough: Playthrough): string {
  const lines: string[] = [];
  const player = playthrough.playerCharacter;
  if (player?.appearance) lines.push(`${player.name} (player) — ${player.appearance}`);
  for (const character of playthrough.characters) {
    if (character.currentLocationId !== playthrough.locationId) continue;
    const clothing = character.clothing.length
      ? `wearing ${character.clothing.map((item) => item.name).join(", ")}`
      : "clothing unspecified";
    const conditions = character.conditions.length ? `, ${character.conditions.join(", ")}` : "";
    lines.push(`${character.name} — ${clothing}, ${character.mood}${conditions}`);
    // templateId first; a character with a stale/unset id still gets an identity
    // when a template carries the same name.
    const template = playthrough.characterTemplates.find((t) => t.id === character.templateId)
      ?? playthrough.characterTemplates.find((t) => t.name === character.name);
    const identity = template ? castIdentity(template.content) : "";
    if (identity) lines.push(`${character.name}'s sheet — ${identity}`);
  }
  return lines.join("\n");
}

/** The nearest visible user message before `message` — the action the image is
 *  answering. Hidden (state-only) user messages are skipped. */
function previousUserContent(playthrough: { messages: ChatMessage[] }, message: ChatMessage): string | undefined {
  const index = playthrough.messages.findIndex((m) => m.id === message.id);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = playthrough.messages[i];
    if (candidate.role === "user" && !candidate.hidden) return candidate.content;
  }
  return undefined;
}

export const imageRoutes: FastifyPluginAsync<ImageRoutesOptions> = async (app, options = {}) => {
  const dataDir = options.dataDir ?? defaultDataDir;
  const imagesDir = options.imagesDir ?? IMAGES_DIR;
  const manager = options.manager ?? providerManager;
  const loadPresets = options.loadPresets ?? defaultLoadPresets;
  const fetchImpl = options.fetchImpl ?? fetch;

  // Content-addressed read: the file name IS the hash, so an immutable cache
  // header is safe. The name is validated before any filesystem call.
  app.get("/api/images/:file", async (request, reply) => {
    const { file } = z.object({ file: z.string() }).parse(request.params);
    const path = imageFilePath(file, imagesDir);
    if (!path) return reply.code(404).send({ error: "Image not found" });
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return reply.type(mimeForFile(file)).send(createReadStream(path));
  });

  // Dry run: compose the prompt without generating — powers the preview modal.
  // Runs the text side call exactly once and persists nothing.
  app.post("/api/playthroughs/:id/messages/:messageId/image/prompt", async (request, reply) => {
    const params = MessageParams.parse(request.params);
    const body = GenerateImageBody.parse(request.body ?? {});
    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const message = playthrough.messages.find((m) => m.id === params.messageId);
    if (!message) return reply.code(404).send({ error: "Message not found" });
    if (message.role !== "assistant") return reply.code(400).send({ error: "Images attach to assistant messages only" });

    const imageConn = manager.imageConnection(body.imageProviderId);
    if (!imageConn) return reply.code(400).send({ error: "No image provider configured — add one in Settings → Provider → Images." });

    const promptConfig = manager.resolveImagePromptConfig(imageConn);
    if (!promptConfig) return reply.code(400).send({ error: "No text provider available to write the image prompt." });

    const settings = resolveImageSettings(playthrough, loadPresets());
    const controller = abortOnClientDisconnect(reply);

    let prompt: string;
    let negativePrompt: string;
    let warnings: string[];
    let promptTruncated: boolean;
    try {
      const result = await generateImagePrompt(promptConfig, settings, {
        messageContent: message.content,
        previousUserContent: previousUserContent(playthrough, message),
        stateSummary: summarizePlaythrough(playthrough),
        castSummary: buildCastBlock(playthrough)
      }, fetchImpl, controller.signal);
      prompt = result.prompt;
      negativePrompt = result.negativePrompt;
      warnings = result.warnings;
      promptTruncated = result.promptTruncated;
    } catch (error) {
      if (controller.signal.aborted) return;
      const reason = error instanceof Error ? error.message : "Image prompt generation failed";
      return reply.code(502).send({ error: reason });
    }
    if (controller.signal.aborted) return;

    // Clamp to the dialect cap here too, so what the modal shows is byte-for-byte
    // what the generate call will send.
    const composedPrompt = clampComposed(prompt, settings, imageConn);
    const composedNegative = clampComposed(negativePrompt, settings, imageConn);
    // The cut happens at the END of the text, which is exactly where the tag
    // list's action and physical-state tags live — say so before the image call
    // is paid for. The prompt side call clamps to the preset limit first, so
    // both cuts are reported (a ceiling hit anywhere is a ceiling hit).
    if (promptTruncated || composedPrompt.truncated) {
      warnings.push(
        `The composed prompt is longer than the ${composedLimit(settings, imageConn)}-character limit, so it was cut at the end — where the action and physical-state tags sit. Move the essential tags earlier in the list, or raise the character limit on the Image Generation tab.`
      );
    }
    return {
      prompt: composedPrompt.text,
      negativePrompt: composedNegative.text,
      // Advisory only — the modal shows these above the editable prompt and the
      // user decides. Never a reason to fail the call.
      warnings
    };
  });

  // Manual sweep: no record change drives this one — the user asked for it, so a
  // failure is REPORTED (500) instead of swallowed like the two best-effort call
  // sites. The count is the whole answer: how many unreferenced files went away.
  app.post("/api/settings/images/sweep", async (request, reply) => {
    try {
      return { removed: sweepOrphansInDataDir(dataDir, imagesDir) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Image sweep failed";
      return reply.code(500).send({ error: reason });
    }
  });

  // Drop one image ref from a message, then sweep the now-unreferenced file.
  // Idempotent: removing a ref that is already gone still returns the record.
  app.delete("/api/playthroughs/:id/messages/:messageId/images/:file", async (request, reply) => {
    const params = z.object({ id: z.string(), messageId: z.string(), file: z.string() }).parse(request.params);
    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const message = playthrough.messages.find((m) => m.id === params.messageId);
    if (!message) return reply.code(404).send({ error: "Message not found" });

    // `file` is only ever compared against stored refs (never joined onto a
    // path), and the sweep refuses non-hash names — no traversal surface here.
    const remaining = (message.images ?? []).filter((image) => image.file !== params.file);
    if (remaining.length !== (message.images ?? []).length) {
      if (remaining.length) message.images = remaining;
      else delete message.images;
      updatePlaythroughRecord(dataDir, playthrough);
      // Best-effort, like the playthrough-delete and truncate sites: the
      // reference is ALREADY gone from the persisted record, so a failed sweep
      // must not report the removal as failed (and must not leave the client
      // showing "nothing was changed" over a change that landed). The file is
      // collected by the next sweep or the manual endpoint.
      try {
        sweepOrphansInDataDir(dataDir, imagesDir);
      } catch (error) {
        console.warn(`[images] orphan sweep after removing an image from ${params.messageId} failed:`, error);
      }
    }
    return reply.send({ playthrough });
  });

  app.post("/api/playthroughs/:id/messages/:messageId/image", async (request, reply) => {
    const params = MessageParams.parse(request.params);
    const body = GenerateImageBody.parse(request.body ?? {});
    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const message = playthrough.messages.find((m) => m.id === params.messageId);
    if (!message) return reply.code(404).send({ error: "Message not found" });
    if (message.role !== "assistant") return reply.code(400).send({ error: "Images attach to assistant messages only" });

    const imageConn = manager.imageConnection(body.imageProviderId);
    if (!imageConn) return reply.code(400).send({ error: "No image provider configured — add one in Settings → Provider → Images." });

    const promptConfig = manager.resolveImagePromptConfig(imageConn);
    if (!promptConfig) return reply.code(400).send({ error: "No text provider available to write the image prompt." });

    const settings = resolveImageSettings(playthrough, loadPresets());
    const controller = abortOnClientDisconnect(reply);
    const imageProvider = manager.getImageProvider(body.imageProviderId);

    // The seed this generation will use: a per-request seed wins, then the
    // connection's own. Neither present (or 0, which Venice documents as "pick
    // one at random") leaves it unset and the provider chooses — and then the
    // ref stores nothing, because a random image is not reproducible anyway.
    const seed = body.seed ?? imageConn.seed;

    // 1) The prompt. SKIPPED only when BOTH overrides are present — that is the
    //    preview-modal path: the user already reviewed (and possibly edited) the
    //    text, so re-running the text model would cost tokens and discard their
    //    edits. One override alone still runs the text call and then replaces
    //    just that side. An override is the FINAL composed text (the modal shows
    //    the composed prompt), so the preset prefix is never applied twice.
    const hasPrompt = typeof body.promptOverride === "string";
    const hasNegative = typeof body.negativeOverride === "string";
    let promptUsed: string;
    let negativeUsed: string;
    // The prompt-writing side call's provenance, when that call actually ran.
    // Undefined on the both-overrides path (no text call was made).
    let promptCall: { request: string; response: string } | undefined;
    if (hasPrompt && hasNegative) {
      promptUsed = clampComposed(body.promptOverride!, settings, imageConn).text;
      negativeUsed = clampComposed(body.negativeOverride!, settings, imageConn).text;
    } else {
      try {
        const written = await generateImagePrompt(promptConfig, settings, {
          messageContent: message.content,
          previousUserContent: previousUserContent(playthrough, message),
          stateSummary: summarizePlaythrough(playthrough),
          castSummary: buildCastBlock(playthrough)
        }, fetchImpl, controller.signal);
        promptUsed = clampComposed(hasPrompt ? body.promptOverride! : written.prompt, settings, imageConn).text;
        negativeUsed = clampComposed(hasNegative ? body.negativeOverride! : written.negativePrompt, settings, imageConn).text;
        promptCall = {
          request: written.rawInput,
          response: clampStoredPromptResponse(written.rawOutput)
        };
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "Image prompt generation failed";
        return reply.code(502).send({ error: reason });
      }
      if (controller.signal.aborted) return;
    }

    // 2) Generate. `promptUsed`/`negativeUsed` are exactly what is sent here, so
    //    the stored ref and the response agree with what the provider received.
    let result;
    try {
      result = await imageProvider.generateImage({
        prompt: promptUsed,
        negativePrompt: negativeUsed || undefined,
        size: imageConn.size,
        aspectRatio: imageConn.aspectRatio,
        seed,
        variants: imageConn.variants,
        safeMode: imageConn.safeMode,
        stylePreset: imageConn.stylePreset,
        hideWatermark: imageConn.hideWatermark,
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const reason = error instanceof Error ? error.message : "Image generation failed";
      return reply.code(502).send({ error: reason });
    }
    if (controller.signal.aborted) return;

    // 3) Persist the bytes content-addressed, then append the ref(s) to the
    //    message. Every returned variant is kept; `image` is the first one.
    if (!result.images.length) return reply.code(502).send({ error: "Image provider returned no image data" });
    const createdAt = new Date().toISOString();
    const refs: MessageImage[] = result.images.map((image) => {
      const { file } = saveImageBytes(image.bytes, image.mime, imagesDir);
      return {
        file,
        prompt: promptUsed,
        negativePrompt: negativeUsed || undefined,
        providerId: result.providerId,
        model: result.model,
        // What the adapter ACTUALLY sent (its own report), not what we asked
        // for: the OpenAI-compatible dialect has no seed field, so asking for
        // one there must not stamp a seed the provider never saw. Absent when
        // the provider picked one at random — which is what makes a re-roll
        // comparable or not, honestly.
        seed: result.seed,
        durationMs: result.durationMs,
        // Diagnostic provenance: the exact body the adapter sent upstream. Body
        // only (the adapters never fold headers or the key into it), and every
        // variant of one call shares it. The raw RESPONSE is deliberately not
        // stored — it carries the base64 payload and would bloat the record.
        request: result.rawRequest,
        // …and the PROMPT side call's provenance, when one ran. Body only, and
        // the response is capped (`clampStoredPromptResponse`) so a verbose
        // reasoning model cannot bloat the playthrough record. Absent on the
        // both-overrides path, which makes no text call at all.
        ...(promptCall
          ? { promptRequest: promptCall.request, promptResponse: promptCall.response }
          : {}),
        createdAt
      };
    });
    message.images = [...(message.images ?? []), ...refs];
    updatePlaythroughRecord(dataDir, playthrough);

    return reply.send({ playthrough, image: refs[0], promptUsed, negativeUsed });
  });
};
