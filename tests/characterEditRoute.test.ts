import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { characterRoutes } from "../src/server/routes/characters";
import { createPlaythroughRecord, getPlaythroughRecord } from "../src/server/store";
import { applyStatePatch } from "../src/engine/engine";
import type { Playthrough } from "../src/schemas";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function harness(): { app: FastifyInstance; dataDir: string } {
  const root = mkdtempSync(join(tmpdir(), "bobbinloom-charedit-"));
  tempDirs.push(root);
  const dataDir = join(root, "playthroughs");
  const app = Fastify();
  app.register(characterRoutes, { dataDir });
  return { app, dataDir };
}

describe("PUT /api/playthroughs/:id/characters/:characterId", () => {
  it("edits simple character fields including name and persists to storage", async () => {
    const h = harness();
    let pt = createPlaythroughRecord(h.dataDir, "Simple Char Edit Test");

    // Add a simple character via state action
    const patched = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Old Bartender", description: "Grumpy guy", storyRole: "Tavern keeper" }]
    });
    pt = patched.state;
    const { updatePlaythroughRecord } = await import("../src/server/store");
    updatePlaythroughRecord(h.dataDir, pt);

    const simpleChar = pt.characters.find((c) => c.name === "Old Bartender")!;
    expect(simpleChar.templateId).toBeUndefined();

    // Call PUT route to edit name, description, role, mood, etc.
    const res = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/${pt.id}/characters/${simpleChar.id}`,
      payload: {
        name: "Barnaby the Barkeep",
        description: "A warm and friendly dwarf serving ale.",
        storyRole: "Tavern Owner",
        mood: "cheerful",
        towardPlayer: "welcoming",
        memorySummary: "Met the adventurer yesterday.",
        conditions: ["Drunk"],
        flags: ["Gave Free Drink"]
      }
    });

    expect(res.statusCode).toBe(200);
    const updatedPt = res.json() as Playthrough;
    const updatedChar = updatedPt.characters.find((c) => c.id === simpleChar.id)!;
    expect(updatedChar.name).toBe("Barnaby the Barkeep");
    expect(updatedChar.description).toBe("A warm and friendly dwarf serving ale.");
    expect(updatedChar.storyRole).toBe("Tavern Owner");
    expect(updatedChar.mood).toBe("cheerful");
    expect(updatedChar.towardPlayer).toBe("welcoming");
    expect(updatedChar.memorySummary).toBe("Met the adventurer yesterday.");
    expect(updatedChar.conditions).toEqual(["Drunk"]);
    expect(updatedChar.flags).toEqual(["Gave Free Drink"]);

    // Reload from store to verify persistence
    const reloaded = getPlaythroughRecord(h.dataDir, pt.id);
    const reloadedChar = reloaded?.characters.find((c) => c.id === simpleChar.id)!;
    expect(reloadedChar.name).toBe("Barnaby the Barkeep");
    expect(reloadedChar.description).toBe("A warm and friendly dwarf serving ale.");
    expect(reloadedChar.storyRole).toBe("Tavern Owner");
    expect(reloadedChar.mood).toBe("cheerful");
    expect(reloadedChar.conditions).toEqual(["Drunk"]);
  });

  it("toggles presence inScene on and off via route", async () => {
    const h = harness();
    let pt = createPlaythroughRecord(h.dataDir, "Presence Toggle Test");
    const char = pt.characters[0];

    // Initially inScene
    expect(pt.activeCharacters).toContain(char.id);

    // Toggle off-screen
    const res1 = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/${pt.id}/characters/${char.id}`,
      payload: {
        inScene: false
      }
    });

    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as Playthrough;
    expect(body1.activeCharacters).not.toContain(char.id);

    // Reload and check persistence
    const reloaded1 = getPlaythroughRecord(h.dataDir, pt.id);
    expect(reloaded1?.activeCharacters).not.toContain(char.id);

    // Toggle back in-scene
    const res2 = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/${pt.id}/characters/${char.id}`,
      payload: {
        inScene: true
      }
    });

    expect(res2.statusCode).toBe(200);
    const body2 = res2.json() as Playthrough;
    expect(body2.activeCharacters).toContain(char.id);

    const reloaded2 = getPlaythroughRecord(h.dataDir, pt.id);
    expect(reloaded2?.activeCharacters).toContain(char.id);
  });

  it("edits template-backed character name on both instance and template", async () => {
    const h = harness();
    const pt = createPlaythroughRecord(h.dataDir, "Template Char Edit Test");
    const char = pt.characters[0];
    expect(char.templateId).toBeDefined();

    const res = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/${pt.id}/characters/${char.id}`,
      payload: {
        name: "Mira Vance",
        mood: "determined"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Playthrough;
    const updatedChar = body.characters.find((c) => c.id === char.id)!;
    expect(updatedChar.name).toBe("Mira Vance");
    expect(updatedChar.mood).toBe("determined");

    const updatedTpl = body.characterTemplates.find((t) => t.id === char.templateId)!;
    expect(updatedTpl.name).toBe("Mira Vance");

    // Check storage persistence
    const reloaded = getPlaythroughRecord(h.dataDir, pt.id);
    expect(reloaded?.characters.find((c) => c.id === char.id)?.name).toBe("Mira Vance");
    expect(reloaded?.characterTemplates.find((t) => t.id === char.templateId)?.name).toBe("Mira Vance");
  });
});
