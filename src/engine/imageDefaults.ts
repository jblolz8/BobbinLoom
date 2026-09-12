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
- Every item is a TAG, not a clause: a bare noun phrase (white shirt (open), long brown hair) or a bare action word (straddling, kneeling, leaning forward).
- NEVER write articles (a, an, the), the verb to be (is, are, was), or joining words (and, with, while, wearing, holding). Never a clause like "she is ..." or "his hand is ...".
- ONE FRAME, ONE INSTANT: never chain movement. Not "gripping him while arching her back" but gripping his shoulders, back arched.
- Never output a character's name or a place name from the story. Names are invisible to an image model — use the visible traits instead.
- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.
- 40-70 tags. The FIRST ~300 CHARACTERS carry the most weight (the encoder reads the prompt in chunks and weights the tail less), and the list is also cut from the END if it runs long — so the framing, place and pose go early and essential detail never goes last.
- No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.
- Only what the message shows: do not add acts, people or undress it did not describe, and do not sanitise what it did.

WRONG / RIGHT
WRONG: "A medium close-up shot of Jeneine, a woman with pale skin and tired blue eyes, straddling him while leaning down to touch his neck."
RIGHT: close-up, 1boy 1girl, pale skin, tired eyes, blue eyes, straddling, leaning forward, hand on his neck

TAG ORDER
1. Rating, then character count: 1girl, 2girls, 1boy 1girl ...
2. Camera framing and angle
3. Scene: location, time of day, lighting
4. Pose and action
5. Appearance: hair length and colour, eye colour, skin tone, build, notable features
6. Expression and gaze
7. Clothing item by item, with its state — white shirt (open), black skirt (hiked up), panties (around one ankle); naked / topless / bottomless when that is the scene
8. Physical state last — sweat, tears, flushed skin, trembling

WHO IS WHO (two or more characters)
- Give each person their own tags, in the order you introduced them.
- When a tag could belong to either person, prefix it: her ponytail, his black hair, her hand on her own thigh.
- In a one-person scene never use those prefixes — they are wasted tags.

MULTIPLE CHARACTERS (two or more characters in frame)
- Keep each character's tags together and separate the groups with " | " — a space, a pipe, a space. Still ONE line: a pipe groups the tags, it never starts a new line.
- The FIRST group holds what is shared (scene, lighting, the interaction); then one group per character, in the order they appear.
- The rating and the character count still open the line, in that first group.
- A scene with ONE character has no " | " at all.

THE PLAYER (POV scenes)
- Seen through the player's eyes? Tag it pov. The player is never named: they are viewer, male pov or female pov.
- The player's visible body gets its own tags: viewer's hands visible, pov hands on her hips, male pov exposed penis.
- Player not in frame? Use a neutral camera tag: wide shot, medium shot, close-up, from above, from below, dutch angle.

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
safe, 1girl, close-up, bedroom, night, dim lighting, sitting on bed, long brown hair, ponytail, blue eyes, pale skin, slim waist, looking at viewer, flushed face, white t-shirt, grey panties, arms crossed

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
    "lowres, worst quality, low quality, normal quality, blurry, out of focus, jpeg artifacts, " +
    "bad anatomy, deformed, bad proportions, poorly drawn face, long neck, malformed limbs, " +
    "missing limbs, extra limbs, extra arms, extra legs, bad hands, extra fingers, extra digits, " +
    "fewer digits, missing fingers, fused fingers, mutated hands, duplicate, text, dialogue, " +
    "speech bubble, thought bubble, caption, subtitles, comic, comic panel, panel layout, " +
    "multiple views, 4koma, storyboard, split screen, collage, border, watermark, signature, username, " +
    "artist name, logo, web address, patreon username, twitter username, stamp, photorealistic, " +
    "realistic, 3d, cgi",
  promptCharacterLimit: IMAGE_PROMPT_CHARACTER_LIMIT,
  includeState: true,
  includeCast: true
};
