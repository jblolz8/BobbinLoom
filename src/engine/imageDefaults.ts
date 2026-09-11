import type { ImageGenerationSettings } from "../schemas";

/** Shipped image-prompt instruction for the Default presets. It deliberately
 *  forbids style keywords: `positivePrefix` is the single place art direction
 *  lives, so a preset can be restyled without touching this text. */
export const DEFAULT_IMAGE_PROMPT_INSTRUCTION =
  "You write image-generation prompts for an interactive story.\n\n" +
  "Given a scene from the story, describe ONE still image of the current moment — a single " +
  "frame, not a sequence. In this order, cover: the subject or subjects and how many; their " +
  "visible appearance (build, hair, eyes, skin, notable features); what they are wearing, or " +
  "not wearing; pose and action; facial expression; the setting and background; lighting and " +
  "time of day; camera framing and angle.\n\n" +
  "Rules:\n" +
  "- Describe only what a camera would see. No narration, no dialogue, no thoughts, no story " +
  "mechanics (no turn numbers, no state names, no character-sheet labels).\n" +
  "- Concrete nouns and adjectives beat mood words: \"rain-slick cobblestones under a " +
  "flickering neon sign\" is better than \"a moody atmosphere\".\n" +
  "- Include only characters who are actually in the scene, and no more than three. Match " +
  "each one's established look from the scene text.\n" +
  "- Do not add quality tags, artist names, or style keywords — a style prefix is added " +
  "separately.\n" +
  "- Keep the prompt under 600 characters.\n\n" +
  'Return JSON only: {"prompt": "<the image prompt>", "negative_prompt": "<what to avoid in ' +
  'this specific image, or an empty string>"}';

/** Read-time fallback for any preset that has no `imageGeneration` block (all
 *  of them, before this feature landed) and for playthrough snapshots taken
 *  before it. Read sites resolve `preset.imageGeneration ?? DEFAULT`. */
export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  instruction: DEFAULT_IMAGE_PROMPT_INSTRUCTION,
  positivePrefix: "anime style",
  negativePrefix:
    "lowres, bad anatomy, bad hands, extra fingers, extra limbs, deformed, poorly drawn face, " +
    "bad proportions, watermark, signature, text, jpeg artifacts",
  promptCharacterLimit: 900,
  includeState: true,
  includeCast: true
};
