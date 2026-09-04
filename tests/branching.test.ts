import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  branchPlaythroughRecord,
  createPlaythroughRecord,
  getPlaythroughRecord,
  listPlaythroughRecords,
  listPlaythroughTimelines,
  promotePlaythroughBranchRecord,
  updatePlaythroughRecord
} from "../src/server/store";
import { ensureMessageTurns, takeTurnSnapshot } from "../src/engine/engine";
import type { ChatMessage, Playthrough } from "../src/schemas";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("branching playthroughs", () => {
  it("ensureMessageTurns assigns sequential turn numbers to legacy messages", () => {
    const messages: ChatMessage[] = [
      { id: "m0", role: "assistant", content: "Opening scene", createdAt: "2026-09-01T00:00:00Z" },
      { id: "m1", role: "user", content: "Look around", createdAt: "2026-09-01T00:01:00Z" },
      { id: "m2", role: "assistant", content: "You see a dark hall.", createdAt: "2026-09-01T00:01:05Z" },
      { id: "m3", role: "user", content: "Open the door", createdAt: "2026-09-01T00:02:00Z" },
      { id: "m4", role: "assistant", content: "The door creaks open.", createdAt: "2026-09-01T00:02:05Z" }
    ];

    ensureMessageTurns(messages);

    expect(messages[0].turn).toBe(0);
    expect(messages[1].turn).toBe(1);
    expect(messages[2].turn).toBe(1);
    expect(messages[3].turn).toBe(2);
    expect(messages[4].turn).toBe(2);
  });

  it("branches a playthrough from an intermediate message and rolls back world state", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-branch-"));
    tempDirs.push(dir);

    const original = createPlaythroughRecord(dir, "Main Quest");
    original.locationId = "loc_tavern";
    original.flags = ["entered_tavern"];
    original.inventory = [{ itemId: "gold_coin", quantity: 10 }];

    // Simulate Turn 1: snapshot taken at turn 0, then user + assistant added
    const snapshotTurn0 = takeTurnSnapshot(original);
    original.turn = 1;
    original.locationId = "loc_cellar";
    original.flags.push("found_cellar");
    original.inventory.push({ itemId: "rusty_key", quantity: 1 });
    original.memoryEvents.push({
      id: "ev1",
      playthroughId: original.id,
      branchId: original.branchId,
      turn: 1,
      type: "event",
      summary: "Found the rusty key in the cellar",
      importance: 3,
      tags: ["discovery"],
      createdAt: "2026-09-01T00:01:05Z"
    });

    original.messages.push(
      { id: "msg_u1", role: "user", content: "I go down to the cellar", createdAt: "2026-09-01T00:01:00Z", turn: 1 },
      { id: "msg_a1", role: "assistant", content: "You find a rusty key.", createdAt: "2026-09-01T00:01:05Z", turn: 1 }
    );
    original.snapshots = { msg_a1: snapshotTurn0 };

    // Simulate Turn 2: snapshot taken at turn 1, then user + assistant added
    const snapshotTurn1 = takeTurnSnapshot(original);
    original.turn = 2;
    original.locationId = "loc_dungeon";
    original.flags.push("unlocked_dungeon");
    original.inventory.push({ itemId: "magic_sword", quantity: 1 });
    original.memoryEvents.push({
      id: "ev2",
      playthroughId: original.id,
      branchId: original.branchId,
      turn: 2,
      type: "event",
      summary: "Claimed the magic sword in the dungeon",
      importance: 5,
      tags: ["loot"],
      createdAt: "2026-09-01T00:02:05Z"
    });

    original.messages.push(
      { id: "msg_u2", role: "user", content: "I unlock the heavy iron door", createdAt: "2026-09-01T00:02:00Z", turn: 2 },
      { id: "msg_a2", role: "assistant", content: "The door swings wide to reveal a magic sword!", createdAt: "2026-09-01T00:02:05Z", turn: 2 }
    );
    original.snapshots.msg_a2 = snapshotTurn1;

    updatePlaythroughRecord(dir, original);

    // Now branch off right after msg_a1 (Turn 1 assistant message)
    const branch = branchPlaythroughRecord(dir, original.id, "msg_a1", "Alternative Cellar Choice");

    expect(branch).not.toBeNull();
    expect(branch?.id).not.toBe(original.id);
    expect(branch?.branchId).not.toBe(original.branchId);
    expect(branch?.parentBranchId).toBe(original.branchId);
    expect(branch?.name).toBe("Alternative Cellar Choice");
    expect(branch?.createdFromTurn).toBe(1);

    // Messages should be truncated after msg_a1
    expect(branch?.messages.map((m) => m.id)).toEqual(["msg_u1", "msg_a1"]);

    // World state should be rolled back to Turn 1 (before Turn 2 ran)
    expect(branch?.turn).toBe(1);
    expect(branch?.locationId).toBe("loc_cellar");
    expect(branch?.flags).toContain("found_cellar");
    expect(branch?.flags).not.toContain("unlocked_dungeon");
    expect(branch?.inventory.some((i) => i.itemId === "rusty_key")).toBe(true);
    expect(branch?.inventory.some((i) => i.itemId === "magic_sword")).toBe(false);

    // Memory events should only contain turn 1 events, re-keyed to the new branch
    expect(branch?.memoryEvents.length).toBe(1);
    expect(branch?.memoryEvents[0].summary).toBe("Found the rusty key in the cellar");
    expect(branch?.memoryEvents[0].playthroughId).toBe(branch?.id);
    expect(branch?.memoryEvents[0].branchId).toBe(branch?.branchId);

    // Snapshots: only retained for messages that still exist
    expect(branch?.snapshots).toHaveProperty("msg_a1");
    expect(branch?.snapshots).not.toHaveProperty("msg_a2");

    expect(branch?.rootPlaythroughId).toBe(original.id);
    expect(branch?.isTimelineBranch).toBe(true);

    // Verify original playthrough is completely untouched on disk
    const reloadedOriginal = getPlaythroughRecord(dir, original.id);
    expect(reloadedOriginal?.turn).toBe(2);
    expect(reloadedOriginal?.locationId).toBe("loc_dungeon");
    expect(reloadedOriginal?.messages.length).toBe(4);
    expect(reloadedOriginal?.flags).toContain("unlocked_dungeon");
  });

  it("supports internal timeline branches vs standalone branches, listing and promotion", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-branch-"));
    tempDirs.push(dir);

    const original = createPlaythroughRecord(dir, "Epic Story");
    original.messages.push({ id: "m1", role: "assistant", content: "Hello", createdAt: "2026-09-01T00:00:00Z", turn: 0 });
    updatePlaythroughRecord(dir, original);

    // 1. Internal branch (default)
    const internalBranch = branchPlaythroughRecord(dir, original.id, "m1", "Secret Path");
    expect(internalBranch?.rootPlaythroughId).toBe(original.id);
    expect(internalBranch?.isTimelineBranch).toBe(true);

    // 2. Standalone branch
    const standaloneBranch = branchPlaythroughRecord(dir, original.id, "m1", "Spin-off Adventure", true);
    expect(standaloneBranch?.rootPlaythroughId).toBe(original.id);
    expect(standaloneBranch?.isTimelineBranch).toBe(false);

    // 3. Main save list by default hides internal timeline branches
    const defaultList = listPlaythroughRecords(dir);
    const listedIds = defaultList.playthroughs.map((p) => p.id);
    expect(listedIds).toContain(original.id);
    expect(listedIds).toContain(standaloneBranch?.id);
    expect(listedIds).not.toContain(internalBranch?.id);

    // 4. Including branches shows everything
    const fullList = listPlaythroughRecords(dir, { includeTimelineBranches: true });
    expect(fullList.playthroughs.map((p) => p.id)).toContain(internalBranch?.id);

    // 5. listPlaythroughTimelines returns all timelines of that playthrough family
    const timelinesFromRoot = listPlaythroughTimelines(dir, original.id);
    expect(timelinesFromRoot.map((p) => p.id)).toEqual(
      expect.arrayContaining([original.id, internalBranch!.id, standaloneBranch!.id])
    );

    const timelinesFromBranch = listPlaythroughTimelines(dir, internalBranch!.id);
    expect(timelinesFromBranch.map((p) => p.id)).toEqual(
      expect.arrayContaining([original.id, internalBranch!.id, standaloneBranch!.id])
    );

    // 6. Promote internal branch to standalone
    const promoted = promotePlaythroughBranchRecord(dir, internalBranch!.id);
    expect(promoted?.isTimelineBranch).toBe(false);

    const listAfterPromotion = listPlaythroughRecords(dir);
    expect(listAfterPromotion.playthroughs.map((p) => p.id)).toContain(internalBranch!.id);
  });

  it("returns null when attempting to branch an unknown playthrough or message", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-branch-"));
    tempDirs.push(dir);

    const created = createPlaythroughRecord(dir, "Single Run");
    expect(branchPlaythroughRecord(dir, "non_existent_id", "msg_1")).toBeNull();
    expect(branchPlaythroughRecord(dir, created.id, "non_existent_msg")).toBeNull();
  });
});
