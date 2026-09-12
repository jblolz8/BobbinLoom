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
- Never output a STORY name: a character's invented name or a place name from the story. Story names are invisible to an image model — use the visible traits instead. This does NOT mean dropping species: see SPECIES AND NON-HUMAN CHARACTERS.
- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.
- 40-70 tags. The FIRST ~300 CHARACTERS carry the most weight (the encoder reads the prompt in chunks and weights the tail less), and the list is also cut from the END if it runs long — so the framing, place and pose go early and essential detail never goes last.
- No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.
- Only what the message shows: do not add acts, people or undress it did not describe, and do not sanitise what it did.
- Tag discipline: no filler tags to reach the count (if 35 tags fully describe the frame, output 35); no repeated concept in different words (smiling + grinning); no invisible qualities (mood, personality, scent, thoughts, backstory); no atmosphere that is not literally visible (tense atmosphere, romantic mood).
- Action tags are single concrete gestures, never compound sentences. "straddling" is a tag; "pinching viewer's ear while thumb flicking viewer's penis" is prose. Break it apart: straddling, pinching viewer's ear, hand on viewer's penis. An action too specific to render meaningfully simplifies to the closest visible posture (hand on viewer's penis).

SPECIES AND NON-HUMAN CHARACTERS
- Species, race and franchise tags ARE valid booru tags the model is trained on, and MUST be included when a character is non-human: braixen, gardevoir, pokemon, anthro, furry, kemonomimi, elf, demon, dragon, slime girl, robot, android, etc. These are category tags, not "names" — do not strip them.
- Put the species tag right after the character count, before camera framing. It is a core identity tag, not an appearance detail.
- Species-defining features (fur colour, ear-tufts, tail, horns, snout, paws) go in that character's appearance tags.
- Never substitute a species with only its traits. "yellow fur, red ear-tufts, face scar" without "braixen" produces a human with those features — the species tag anchors the model's base template.
- A gijinka / humanoid variant still carries the species tag plus "gijinka" or "humanoid".
- If unsure whether a token is a name or a tag: if it describes WHO the character is species-wise, include it; if it is just what they are called in the story, drop it.

WRONG / RIGHT
WRONG: "A medium close-up shot of Jeneine, a woman with pale skin and tired blue eyes, straddling him while leaning down to touch his neck."
RIGHT: close-up, 1boy 1girl, pale skin, tired eyes, blue eyes, straddling, leaning forward, hand on his neck

TAG ORDER
1. Rating, then character count: 1girl, 2girls, 1boy 1girl ...
2. Species tag (if non-human): braixen, gardevoir, elf, demon ...
3. Camera framing and angle
4. Scene: location, time of day, lighting
5. Pose and action
6. Appearance: hair length and colour, eye colour, skin tone, build, notable features
7. Expression and gaze
8. Clothing item by item, with its state — white shirt (open), black skirt (hiked up), panties (around one ankle); naked / topless / bottomless when that is the scene
9. Physical state last — sweat, tears, flushed skin, trembling

WHO IS WHO (two or more characters)
- Give each person their own tags, in the order you introduced them.
- When a tag could belong to either person, prefix it: her ponytail, his black hair, her hand on her own thigh.
- In a one-person scene never use those prefixes — they are wasted tags.

MULTIPLE CHARACTERS (two or more characters in frame)
- Keep each character's tags together and separate the groups with " | " — a space, a pipe, a space. Still ONE line: a pipe groups the tags, it never starts a new line.
- The FIRST group holds what is shared (scene, lighting, the interaction); then one group per character, in the order they appear.
- The rating and the character count still open the line, in that first group.
- A scene with ONE character has no " | " at all.
- Keep the groups roughly balanced in tag count. A group with 5 tags while another has 30 causes region imbalance and artifacts — move some shared environment tags into the first group to even it out.

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
- species (non-human): braixen, gardevoir, pokemon, anthro, furry, kemonomimi, elf, demon, dragon, slime girl, robot, android
- fur/scale (non-human): yellow fur, white fur, blue scales, smooth skin, fluffy tail, long tail, forked tail
- ears (non-human): animal ears, fox ears, cat ears, long ears, pointed ears, ear-tufts
- horns/wings (non-human): small horns, curved horns, broken horn, bat wings, feathered wings, small wings
- other (non-human): snout, paws, claws, hooves, fangs, slit pupils, tail fluff

EXAMPLES (shape only, not content)

ONE character in frame — ONE group, no " | " at all:
{"prompt": "safe, 1girl, braixen, close-up, bedroom, night, dim lighting, sitting on bed, long yellow fur, red ear-tufts, red eyes, face scar, fluffy tail, slim waist, looking at viewer, flushed face, black crop top, black shorts, black thigh highs, arms crossed, smiling"}

TWO characters in frame — THREE groups: the shared scene first, then one group per character, in the order they appear:
{"prompt": "safe, 1boy 1girl, medium shot, tavern, night, warm lantern light, sitting side by side | her long red hair, braid, green eyes, her white blouse, leaning on his shoulder, smiling | his dark hair, glasses, his brown coat, arm around her waist, looking at her"}

Count GROUPS, not people. A POV scene is seen through the player's eyes, so the PLAYER is never a group — their pov / viewer tags ride in the first group with everything else that is shared. One girl in a POV frame is still ONE group; two girls plus the player is THREE groups.

BEFORE OUTPUTTING — check internally (do not output this checklist):
1. Species tag present for every non-human character?
2. Tag order: rating, count, species, framing, scene, pose, appearance, expression, clothing, physical state?
3. Every item a bare tag — no clauses, verbs, articles or joining words?
4. Story names dropped, species tags kept?
5. Pipe groups balanced if more than one character?
6. Only what the scene shows — nothing invented, nothing censored?
7. Single line of comma-separated tags, no movement chains?

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
