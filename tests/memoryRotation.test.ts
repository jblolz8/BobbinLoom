import { describe, expect, it } from "vitest";
import { createInitialPlaythrough } from "../src/engine/engine";
import { rotateMemoryEvents, MEMORY_ROTATION_THRESHOLD } from "../src/engine/contextBudgeting";

function withEvents(state: ReturnType<typeof createInitialPlaythrough>, count: number) {
  for (let i = 0; i < count; i++) {
    state.memoryEvents.push({
      id: `mem_${i}`,
      playthroughId: state.id,
      branchId: state.branchId,
      type: "event",
      summary: `event ${i}`,
      importance: 1,
      tags: [],
      turn: i,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
  }
  return state;
}

describe("rotateMemoryEvents", () => {
  it("does nothing below the threshold", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), 10);
    const next = rotateMemoryEvents(state);
    expect(next.memoryEvents).toHaveLength(10);
    expect(next.memoryLayers?.compressed ?? []).toHaveLength(0);
  });

  it("returns the input unchanged below the threshold", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), 10);
    expect(rotateMemoryEvents(state)).toBe(state);
  });

  it("moves live events into the compressed layer once the threshold is crossed", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), MEMORY_ROTATION_THRESHOLD + 5);
    const next = rotateMemoryEvents(state);
    expect(next.memoryEvents).toHaveLength(0);
    expect(next.memoryLayers?.compressed.length).toBeGreaterThan(0);
  });

  it("never touches messages", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), MEMORY_ROTATION_THRESHOLD + 5);
    const before = state.messages.map((m) => ({ ...m }));
    const next = rotateMemoryEvents(state);
    expect(next.messages).toEqual(before);
  });

  it("caps retained compressed events", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), MEMORY_ROTATION_THRESHOLD * 4);
    const next = rotateMemoryEvents(state);
    expect(next.memoryLayers!.compressed.length).toBeLessThanOrEqual(50);
  });

  it("honours an explicit threshold override", () => {
    const state = withEvents(createInitialPlaythrough("Rotate"), 3);
    const next = rotateMemoryEvents(state, 3);
    expect(next.memoryEvents).toHaveLength(0);
    expect(next.memoryLayers?.compressed).toHaveLength(3);
  });
});