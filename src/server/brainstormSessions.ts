/**
 * A character's brainstorm session, on disk beside its record.
 *
 * `data/characters/<slug>/brainstorm/session.json` — inside the character's own folder, so exporting the
 * folder carries the conversation and deleting the character quarantines the session in the same move.
 * A SUBFOLDER, not a sibling file: `listCharacterTemplates` reads every `*.json` directly inside a
 * character's folder as a record version and quarantines anything that fails validation, so a
 * `brainstorm.json` beside the record would be swept up as a corrupt character and thrown away. A
 * directory is invisible to that scan.
 *
 * It used to live in the browser's localStorage keyed by character id: the one piece of state a cleared
 * browser or a second device could lose outright, and unlike a tab choice, a lost brainstorm is lost work.
 *
 * A missing file is not an error — most characters have never been brainstormed with.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteJson } from "./persistence";
import { CHARACTERS_DIR, characterFolderForId } from "./store";
import { parseBrainstormSession, type BrainstormSession } from "../engine/brainstorm";

/** The session file inside a character's folder (see the note above on why it is a subfolder). */
export function brainstormSessionPath(folder: string): string {
  return join(folder, "brainstorm", "session.json");
}

export function readBrainstormSession(
  characterId: string,
  dir: string = CHARACTERS_DIR
): BrainstormSession | null {
  const folder = characterFolderForId(characterId, dir);
  if (!folder) return null;
  const file = brainstormSessionPath(folder);
  if (!existsSync(file)) return null;
  try {
    return parseBrainstormSession(JSON.parse(readFileSync(file, "utf8")) as unknown);
  } catch {
    // An unreadable session is not a reason to lose the character, or the editor around it.
    return null;
  }
}

/** Writes the session, or returns null when no record holds that id (a 404 for the caller rather than a
 *  file for a character that does not exist). */
export function writeBrainstormSession(
  characterId: string,
  session: BrainstormSession,
  dir: string = CHARACTERS_DIR
): BrainstormSession | null {
  const folder = characterFolderForId(characterId, dir);
  if (!folder) return null;
  const file = brainstormSessionPath(folder);
  mkdirSync(dirname(file), { recursive: true });
  atomicWriteJson(file, session);
  return session;
}

/** True when a file was removed, false when there was nothing to remove. */
export function deleteBrainstormSession(
  characterId: string,
  dir: string = CHARACTERS_DIR
): boolean {
  const folder = characterFolderForId(characterId, dir);
  if (!folder) return false;
  const file = brainstormSessionPath(folder);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
