import { describe, expect, it } from "vitest";
import {
  createInitialPlaythrough,
  repairMemoryEventTurns,
} from "../src/engine/engine";
import type { Playthrough, MemoryEvent, ChatMessage } from "../src/schemas";

function makeMockPlaythrough(
  events: MemoryEvent[],
  messages: ChatMessage[],
): Playthrough {
  const pt = createInitialPlaythrough("Repair Test Playthrough");
  pt.id = "play_test_repair";
  pt.turn = 11;
  pt.memoryEvents = events;
  pt.messages = messages;
  return pt;
}

describe("repairMemoryEventTurns", () => {
  it("restores corrupted event turns from assistant message patchInfo", () => {
    // 4 events, all corrupted to Turn 11 due to the previous bug
    const events: MemoryEvent[] = [
      {
        id: "mem_1",
        playthroughId: "play_test_repair",
        branchId: "branch_main",
        turn: 11, // corrupted! was turn 1
        type: "action",
        summary: "Arrived at the ancient crossroads",
        importance: 2,
        tags: ["Crossroads"],
        createdAt: "2026-10-10T10:05:00.000Z",
      },
      {
        id: "mem_2",
        playthroughId: "play_test_repair",
        branchId: "branch_main",
        turn: 11, // corrupted! was turn 4
        type: "combat",
        summary: "Fended off highway bandits",
        importance: 3,
        tags: ["Bandits"],
        createdAt: "2026-10-10T10:20:00.000Z",
      },
      {
        id: "mem_3",
        playthroughId: "play_test_repair",
        branchId: "branch_main",
        turn: 11, // corrupted! was turn 7
        type: "dialogue",
        summary: "Learned of the secret pass from the tavern keeper",
        importance: 3,
        tags: ["Secret"],
        createdAt: "2026-10-10T10:35:00.000Z",
      },
      {
        id: "mem_4",
        playthroughId: "play_test_repair",
        branchId: "branch_main",
        turn: 11, // legitimately turn 11
        type: "milestone",
        summary: "Entered the citadel gates",
        importance: 4,
        tags: ["Citadel"],
        createdAt: "2026-10-10T10:55:00.000Z",
      },
    ];

    const messages: ChatMessage[] = [
      {
        id: "msg_a1",
        role: "assistant",
        turn: 1,
        content: "You find yourself at the ancient crossroads.",
        createdAt: "2026-10-10T10:05:00.000Z",
        patchInfo: {
          applied: ["memory event added: Arrived at the ancient crossroads"],
          rejected: [],
          warnings: [],
        },
      },
      {
        id: "msg_a4",
        role: "assistant",
        turn: 4,
        content: "The bandits scatter into the brush.",
        createdAt: "2026-10-10T10:20:00.000Z",
        patchInfo: {
          applied: ["memory event added: Fended off highway bandits"],
          rejected: [],
          warnings: [],
        },
      },
      {
        id: "msg_a7",
        role: "assistant",
        turn: 7,
        content: "The tavern keeper leans in and whispers about the pass.",
        createdAt: "2026-10-10T10:35:00.000Z",
        patchInfo: {
          applied: [
            "memory event added: Learned of the secret pass from the tavern keeper",
          ],
          rejected: [],
          warnings: [],
        },
      },
      {
        id: "msg_a11",
        role: "assistant",
        turn: 11,
        content: "The massive iron gates of the citadel groan open.",
        createdAt: "2026-10-10T10:55:00.000Z",
        patchInfo: {
          applied: ["memory event added: Entered the citadel gates"],
          rejected: [],
          warnings: [],
        },
      },
    ];

    const pt = makeMockPlaythrough(events, messages);
    const repaired = repairMemoryEventTurns(pt);

    expect(repaired).toBe(true);
    expect(pt.memoryEvents.find((e) => e.id === "mem_1")?.turn).toBe(1);
    expect(pt.memoryEvents.find((e) => e.id === "mem_2")?.turn).toBe(4);
    expect(pt.memoryEvents.find((e) => e.id === "mem_3")?.turn).toBe(7);
    expect(pt.memoryEvents.find((e) => e.id === "mem_4")?.turn).toBe(11);

    // Idempotent: running again changes nothing
    const secondPass = repairMemoryEventTurns(pt);
    expect(secondPass).toBe(false);
  });

  it("also repairs events stored in memoryLayers.compressed and recent", () => {
    const pt = makeMockPlaythrough(
      [],
      [
        {
          id: "msg_a2",
          role: "assistant",
          turn: 2,
          content: "Discovered something.",
          createdAt: "2026-10-10T10:10:00.000Z",
          patchInfo: {
            applied: [
              "memory event added: Discovered glowing crystals in the cave",
            ],
            rejected: [],
            warnings: [],
          },
        },
      ],
    );

    pt.memoryLayers = {
      recent: [],
      compressed: [
        {
          id: "mem_comp_1",
          playthroughId: pt.id,
          branchId: "branch_main",
          turn: 11, // corrupted
          type: "discovery",
          summary: "Discovered glowing crystals in the cave",
          importance: 2,
          tags: ["Crystals"],
          createdAt: "2026-10-10T10:10:00.000Z",
        },
      ],
    };

    const repaired = repairMemoryEventTurns(pt);
    expect(repaired).toBe(true);
    expect(pt.memoryLayers?.compressed[0].turn).toBe(2);
  });
});
