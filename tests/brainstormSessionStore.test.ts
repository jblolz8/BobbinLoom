import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  brainstormSessionPath,
  deleteBrainstormSession,
  readBrainstormSession,
  writeBrainstormSession
} from "../src/server/brainstormSessions";
import { buildBrainstormSession } from "../src/engine/brainstorm";
import {
  characterFolderForId,
  createCharacterTemplateRecord,
  listCharacterTemplates
} from "../src/server/store";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-brainstorm-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const MESSAGES = [
  { id: "1", role: "user" as const, content: "give her a hobby" },
  { id: "2", role: "assistant" as const, content: "she could brew tea" }
];

describe("the on-disk brainstorm session", () => {
  it("keeps the session in a subfolder of the character's own folder", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Session Path", dir);
    const folder = characterFolderForId(created.id, dir);
    expect(folder).not.toBeNull();

    const file = brainstormSessionPath(folder!);
    expect(dirname(file)).toBe(join(folder!, "brainstorm"));
    expect(basename(file)).toBe("session.json");
  });

  it("writes a session to disk and reads the same messages back", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Session Round Trip", dir);
    const session = buildBrainstormSession(MESSAGES);

    expect(writeBrainstormSession(created.id, session, dir)).toEqual(session);

    const read = readBrainstormSession(created.id, dir);
    expect(read?.messages).toEqual(session.messages);
    expect(existsSync(brainstormSessionPath(characterFolderForId(created.id, dir)!))).toBe(true);
  });

  it("reads a character that has never been brainstormed as no session at all", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Never Brainstormed", dir);

    // No session is null rather than an empty one: the panel must be able to tell that apart.
    expect(readBrainstormSession(created.id, dir)).toBeNull();
    expect(readBrainstormSession("char_not_in_this_store", dir)).toBeNull();
  });

  it("reads a file holding junk as no session instead of throwing", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Junk Session", dir);
    const file = brainstormSessionPath(characterFolderForId(created.id, dir)!);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "not json", "utf8");

    expect(readBrainstormSession(created.id, dir)).toBeNull();
  });

  it("deletes the session once, then reports there was nothing to remove", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Delete Session", dir);
    const file = brainstormSessionPath(characterFolderForId(created.id, dir)!);
    writeBrainstormSession(created.id, buildBrainstormSession(MESSAGES), dir);

    expect(deleteBrainstormSession(created.id, dir)).toBe(true);
    expect(existsSync(file)).toBe(false);
    expect(deleteBrainstormSession(created.id, dir)).toBe(false);
  });

  it("leaves the character records alone when a session is written", () => {
    const dir = tempDir();
    const created = createCharacterTemplateRecord("Untouched Record", dir);
    const before = listCharacterTemplates(dir);
    const folder = characterFolderForId(created.id, dir)!;

    writeBrainstormSession(created.id, buildBrainstormSession(MESSAGES), dir);

    const after = listCharacterTemplates(dir);
    expect(after.map((t) => t.id)).toEqual(before.map((t) => t.id));
    expect(after.find((t) => t.id === created.id)?.name).toBe("Untouched Record");
    // A session stored as a sibling `*.json` would have been read as a record version, failed
    // validation and been quarantined to `.bak` — the subfolder is what keeps that from happening.
    expect(readdirSync(folder).filter((f) => f.endsWith(".bak"))).toEqual([]);
  });
});
