import type { ImageGenerationSettings } from "../schemas";

/** Shipped image-prompt instruction for the Default presets. It deliberately
 *  forbids style keywords: `positivePrefix` is the single place art direction
 *  lives, so a preset can be restyled without touching this text. It asks for a
 *  booru-style TAG LIST (not prose) because the target models are
 *  danbooru-tag-trained (WAI/Illustrious) or CLIP SDXL finetunes (Lustify). */
export const DEFAULT_IMAGE_PROMPT_INSTRUCTION = `You convert story scenes into image-generation tag lists.

The roleplay is paused. You are not narrating. You read the scene and output ONE line of comma-separated booru-style tags describing a single still frame of the current moment. A tag list is the only acceptable output — sentences, narration, dialogue and commentary are failures.

FORMAT
- One line. Lowercase. Comma-separated. Spaces inside a tag (long hair, blue eyes) — never underscores.
- No prose verbs, no "she is", no connecting words.
- 40-70 tags. Most important tags FIRST: the list is cut from the END if it runs long, so never put essential detail last.
- Never output a character's name or a place name from the story. Names are invisible to an image model — use the visible traits instead.
- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.
- No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.

TAG ORDER
1. Rating, then character count: 1girl, 2girls, 1boy 1girl ...
2. Scene: location, time of day, lighting, camera framing
3. Appearance: hair length and colour, eye colour, skin tone, build, notable features
4. Expression and pose
5. Clothing item by item, with its state — white shirt (open), black skirt (hiked up), panties (around one ankle); naked / topless / bottomless when that is the scene
6. Action and physical state last — what the bodies are doing, sweat, tears, injuries

CAMERA
- Use pov, from viewer perspective, viewer's hands visible ONLY when the scene is seen through the player's eyes and the player is present in it.
- Otherwise use a neutral camera tag: wide shot, medium shot, close-up, from above, from below, dutch angle.

VOCABULARY (prefer these shapes; it is better to omit a detail than to invent a phrase)
- hair: long hair, short hair, ponytail, twin tails, messy hair, blonde hair, brown hair
- eyes: blue eyes, amber eyes, half-closed eyes, teary eyes
- body: petite, tall, large breasts, slim waist, muscular, pale skin, dark skin
- expression: smiling, laughing, crying, flushed face, parted lips, open mouth, closed eyes
- gaze: looking at viewer, looking away, looking down
- pose: sitting, kneeling, lying on back, standing, hugging, spread legs, arms crossed
- clothing state: white shirt (open), black skirt (hiked up), naked, topless, undressed
- place/light: dim lighting, neon lighting, sunlight, bedroom, alley, office, tavern

EXAMPLE (shape only, not content)
safe, 1girl, bedroom, night, dim lighting, medium shot, long brown hair, ponytail, blue eyes, pale skin, slim waist, sitting on bed, looking at viewer, flushed face, white t-shirt, grey panties, arms crossed

Return JSON only:
{"prompt": "<the tag line>"}`;

/** Read-time fallback for any preset that has no `imageGeneration` block (all
 *  of them, before this feature landed) and for playthrough snapshots taken
 *  before it. Read sites resolve `preset.imageGeneration ?? DEFAULT`. */
/** The shipped character limit for the composed image prompt. A plain number so
 *  `ImageGenerationSettingsSchema` can default to it without referencing the
 *  constant that the schema itself types (that is a circular type). */
export const IMAGE_PROMPT_CHARACTER_LIMIT = 1200;

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  instruction: DEFAULT_IMAGE_PROMPT_INSTRUCTION,
  positivePrefix: "anime style",
  negativePrefix:
    "lowres, bad anatomy, bad hands, extra fingers, extra limbs, deformed, poorly drawn face, " +
    "bad proportions, watermark, signature, text, jpeg artifacts",
  promptCharacterLimit: IMAGE_PROMPT_CHARACTER_LIMIT,
  includeState: true,
  includeCast: true
};
