import type { ChatMessage, ImageInstructionMode, Playthrough } from "../../schemas";
import { isStubSection, pickSections } from "../../engine/characterSections";
import { clampChars } from "../imageProvider/shared";

/**
 * The image-prompt call's context blocks.
 *
 * These are deliberately NOT `summarizePlaythrough`: that block is written for a
 * TURN (inventory, quests, allowed ids, reachable locations, absent characters,
 * per-character memory) and is useless to a tag writer while being actively
 * harmful in one specific way — it carries the PLAYER CHARACTER block with the
 * player's description, appearance and wardrobe, which the writer copied straight
 * into the tag line (the player's glasses, necktie and slacks coming out on the
 * character). Everything a frame cannot show is left out, and the player is
 * framed as the camera instead of as another character.
 *
 * The instruction owns the rules; this module owns what the rules are applied to.
 * `docs/image-generation.md` documents both sides.
 */

/** How much of a character sheet's STABLE identity is injected per character.
 *  Enough for the physical tags the writer must keep reproducing, not enough for
 *  one long sheet to dominate the prompt.
 *
 *  Raised 320 → 600 because 320 was starving `[Appearance]`: a typical sheet puts
 *  `[Body]` first and it runs 130-205 characters, so the clamp landed INSIDE
 *  `[Appearance]` and cut its later bullets — which is where `Hair` usually sits.
 *  A live generation rendered a character with no hair at all while the sheet
 *  carried `- Hair: Long light brown, messy, often in a loose ponytail`; the
 *  writer's tags mirrored exactly the text that survived the cut and nothing more. */
const CAST_IDENTITY_CHARS = 600;

/** A sheet line whose LABEL is the hair itself — `Hair:`, `Hair style:`,
 *  `Hair colour:` — anywhere in the sheet. Deliberately label-anchored: a sheet
 *  may also describe ear-tufts "acting as hair" under `[Appearance]`'s Ears
 *  bullet, and matching any line containing "hair" would headline the wrong
 *  feature. */
const HAIR_LABEL = /^[-*\u2022]?\s*hair(\s+(style|colour|color|length|type))?\s*:\s*(.+)$/i;

/** The hair line's own ceiling — a headline, not a description. */
const HAIR_LINE_CHARS = 120;

/** The sheet sections that describe what a camera sees and that the scene does
 *  not change. Deliberately NOT `Clothing`: the character INSTANCE's clothing is
 *  the authoritative current state and already rides on the line above. */
const CAST_IDENTITY_SECTIONS = ["Species", "Gender", "Body", "Appearance"] as const;

/** How much of the player's own description the camera line carries. The first
 *  sentence is enough for gender and pronouns (which the character-count tag and
 *  every `his`/`her` attribution depend on); the rest of a persona's prose is
 *  wardrobe and appearance material the writer must not turn into tags. */
const CAMERA_DESCRIPTION_CHARS = 200;

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

/** The character's hair, as a line of its own.
 *
 *  A HEADLINE, emitted before the sheet line and clamped independently, so no
 *  amount of `[Body]` can order it away and no identity budget can cut it. Hair
 *  colour and style are what a viewer notices first when they are wrong, and they
 *  are the one identity feature the writer cannot recover from prose when the
 *  sheet carries them and the context does not. */
function castHair(content: string): string {
  for (const line of content.split("\n")) {
    const match = HAIR_LABEL.exec(line.trim());
    if (match) return clampChars(match[3].trim(), HAIR_LINE_CHARS);
  }
  return "";
}

/** The scene's PLACE and the player's visible physical state — the two things a
 *  frame shows that the cast block does not already carry.
 *
 *  Categories that appear when a tag line is invented: each character's sheet
 *  (`bodyType` / `appearance` / wardrobe), inventory, quests, allowed ids,
 *  reachable locations, absent characters, per-character memory and the turn
 *  counter. All of them are withheld here, not merely discouraged in prose. */
export function buildImageStateBlock(playthrough: Playthrough): string {
  const catalog = playthrough.locationCatalog ?? [];
  const location = catalog.find((entry) => entry.id === playthrough.locationId);
  const lines: string[] = [];

  if (location) {
    lines.push(`Location: ${location.name}${location.description ? ` — ${location.description}` : ""}`);
    if (location.state) lines.push(`Location state: ${location.state}`);
  } else {
    lines.push(`Location: ${playthrough.locationId}`);
  }

  // The player's conditions are on camera (restrained, handcuffed, wounded) and
  // their clothing is not sent at all.
  if (playthrough.playerCharacter.conditions.length > 0) {
    lines.push(`Player visible state: ${playthrough.playerCharacter.conditions.join(", ")}`);
  }

  return lines.join("\n");
}

/** Compact cast block: the player as THE CAMERA, then every character actually
 *  at the current location. Deliberately short — the scene text is the primary
 *  source of what is happening.
 *
 *  Each present character is described TWICE on purpose: the instance line
 *  (clothing, mood, conditions — the current state) and, when their sheet
 *  resolves, the stable identity line (species, gender, body, appearance). The
 *  writer otherwise scrapes hair/eye/skin out of scene prose, and the same
 *  character comes out looking different in every image.
 *
 *  The player gets NO appearance or clothing line. A POV frame needs to know who
 *  the camera is (for the count tag and for `his`/`her` attribution) and nothing
 *  else about them, and the wardrobe was the exact material that leaked into the
 *  shared group and onto the character.
 *
 *  In `scene` mode the player is not sent AT ALL: the frame is not seen through
 *  their eyes, so naming them here is what produced the wardrobe tags in the
 *  first place. The Scene instruction states the rule instead of this block
 *  restating the player — the two are coupled, so a change that re-adds a camera
 *  line has to reword that instruction's `NO CAMERA` passage too. */
export function buildImageCastBlock(
  playthrough: Playthrough,
  mode: ImageInstructionMode = "pov"
): string {
  const lines: string[] = [];

  if (mode !== "scene") {
    const player = playthrough.playerCharacter;
    lines.push(
      "THE CAMERA (the player — the scene is seen through this person; never tag their stored " +
      "appearance or clothing, and never give them a \" | \" group):"
    );
    const firstSentence = player.description.trim().split(". ")[0] ?? "";
    const cameraNote = clampChars(firstSentence || player.description.trim(), CAMERA_DESCRIPTION_CHARS);
    lines.push(`${player.name}${cameraNote ? ` — ${cameraNote}` : ""}`);
  }

  for (const character of playthrough.characters) {
    if (character.currentLocationId !== playthrough.locationId) continue;
    const clothing = character.clothing.length
      ? `wearing ${character.clothing.map((item) => item.name).join(", ")}`
      : "clothing unspecified";
    const conditions = character.conditions.length ? `, ${character.conditions.join(", ")}` : "";
    // `mood` is a stored slug (`overwhelmed_content`); a reader — and a tag
    // writer — should not have to decode an identifier.
    const mood = character.mood.replace(/_/g, " ").trim() || "unspecified mood";
    lines.push(`${character.name} — ${clothing}, ${mood}${conditions}`);
    // templateId first; a character with a stale/unset id still gets an identity
    // when a template carries the same name.
    const template = playthrough.characterTemplates.find((t) => t.id === character.templateId)
      ?? playthrough.characterTemplates.find((t) => t.name === character.name);
    // Hair headline first, then the full identity line: the identity budget can
    // trim the sheet line, it cannot touch this one.
    const hair = template ? castHair(template.content) : "";
    if (hair) lines.push(`${character.name}'s hair — ${hair}`);
    const identity = template ? castIdentity(template.content) : "";
    if (identity) lines.push(`${character.name}'s sheet — ${identity}`);
  }

  return lines.join("\n");
}

/** Opening line of the history block. The header names the frame explicitly: the
 *  block sits ABOVE the scene text, so a bare "PREVIOUS MESSAGES" reads as if it
 *  were the thing to draw. */
export const IMAGE_HISTORY_HEADER =
  "PREVIOUS MESSAGES (what happened BEFORE the scene text below — continuity only, NOT the frame to render):";

/** Character budget for the whole history block. Deliberately small next to the
 *  shipped instruction (~15.5K characters): extra prose is cheap to add and
 *  expensive in attention, and the writer's job is one frame, not the plot. */
const IMAGE_HISTORY_CHARS = 6000;

export type ImageHistoryBlock = { text: string; messageIds: string[] };

/** The prose messages immediately before `message`, oldest first, as one block.
 *
 *  Hidden (state-only) user messages and system messages are the mechanical state
 *  the writer must not see, exactly as in the routes' `previousUserMessage`; a
 *  chapter-opening assistant message is ordinary prose and stays, and the budget
 *  below is what keeps a long recap from crowding the frame.
 *
 *  `messageIds` is what lets the caller avoid sending the same prose twice: the
 *  nearest user message rides the `PLAYER'S LAST ACTION` block, so when the window
 *  already carries it the caller drops that block. */
export function buildImageHistoryBlock(
  playthrough: Playthrough,
  message: ChatMessage,
  count: number
): ImageHistoryBlock {
  const empty: ImageHistoryBlock = { text: "", messageIds: [] };
  if (count <= 0) return empty;
  const index = playthrough.messages.findIndex((m) => m.id === message.id);
  if (index <= 0) return empty;

  const newestFirst: ChatMessage[] = [];
  for (let i = index - 1; i >= 0 && newestFirst.length < count; i -= 1) {
    const candidate = playthrough.messages[i];
    if (candidate.role === "system" || candidate.hidden) continue;
    if (!candidate.content.trim()) continue;
    newestFirst.push(candidate);
  }
  if (!newestFirst.length) return empty;

  // Whole OLD messages go first: half a sentence of an older beat is worse than
  // not having it, and the nearest beats are the ones that carry continuity.
  let chars = newestFirst.reduce((total, entry) => total + entry.content.length, 0);
  while (newestFirst.length > 1 && chars > IMAGE_HISTORY_CHARS) {
    chars -= newestFirst[newestFirst.length - 1].content.length;
    newestFirst.pop();
  }

  const lines = [...newestFirst].reverse().map((entry) => {
    // A single message over the whole budget keeps its TAIL: the end of an earlier
    // message is the state it left the scene in, which is the part the writer
    // needs. Everything else above is dropped whole, never cut mid-sentence.
    const body = entry.content.length > IMAGE_HISTORY_CHARS
      ? `…[earlier text omitted] ${entry.content.trim().slice(-IMAGE_HISTORY_CHARS)}`
      : entry.content.trim();
    return `${entry.role === "user" ? "User" : "Assistant"}: ${body}`;
  });

  return {
    text: [IMAGE_HISTORY_HEADER, ...lines].join("\n"),
    messageIds: newestFirst.map((entry) => entry.id)
  };
}
