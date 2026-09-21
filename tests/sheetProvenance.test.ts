import { describe, expect, it } from "vitest";
import { latestChange, sectionProvenance, type ProvenanceMessage } from "../src/client/engine/sheetProvenance";

/** A message carrying the engine's own applied-patch sentences. */
const turn = (turnNumber: number, ...applied: string[]): ProvenanceMessage => ({
  turn: turnNumber,
  patchInfo: { applied }
});

describe("section provenance", () => {
  it("reads a bullet change into its section", () => {
    const marks = sectionProvenance(
      [turn(12, "section item replaced: Mika → [Personality] guarded ⇒ openly curious")],
      "Mika"
    );
    expect(marks.get("Personality")).toEqual([
      { turn: 12, note: "guarded ⇒ openly curious" }
    ]);
  });

  it("ignores another character's sheet change", () => {
    const marks = sectionProvenance([turn(9, "section item added: Rei → [Likes] the rain")], "Mika");
    expect(marks.size).toBe(0);
  });

  it("ignores a line that is not a sheet change, rather than guessing", () => {
    const marks = sectionProvenance(
      [turn(4, "mood set: Mika → curious", "clothing added: Mika → Torso: linen shirt")],
      "Mika"
    );
    expect(marks.size).toBe(0);
  });

  it("files a rename under the section's current name", () => {
    const marks = sectionProvenance(
      [turn(30, "section renamed: Mika → [Dislikes] ⇒ [What She Avoids]")],
      "Mika"
    );
    expect([...marks.keys()]).toEqual(["What She Avoids"]);
  });

  it("files a whole-section update and a Clothing redirect", () => {
    const marks = sectionProvenance(
      [
        turn(7, "section updated: Mika → [Body]"),
        turn(8, "clothing updated: Mika (via section redirect)")
      ],
      "Mika"
    );
    expect([...marks.keys()].sort()).toEqual(["Body", "Clothing"]);
    expect(latestChange(marks.get("Body"))).toEqual({ turn: 7, note: "" });
  });

  it("keeps every change to a section, oldest first", () => {
    const marks = sectionProvenance(
      [
        turn(3, "section item added: Mika → [Likes] thunderstorms"),
        turn(11, "section item removed: Mika → [Likes] thunderstorms"),
        turn(20, "section item added: Mika → [Likes] quiet mornings")
      ],
      "Mika"
    );
    const likes = marks.get("Likes");
    expect(likes?.map((change) => change.turn)).toEqual([3, 11, 20]);
    expect(latestChange(likes)).toEqual({ turn: 20, note: "quiet mornings" });
  });

  it("skips messages with no patch record and no turn", () => {
    const marks = sectionProvenance(
      [
        { turn: 5 },
        { patchInfo: { applied: ["section item added: Mika → [Likes] tea"] } },
        turn(6, "section item added: Mika → [Likes] coffee")
      ],
      "Mika"
    );
    expect(marks.get("Likes")?.map((change) => change.turn)).toEqual([6]);
  });

  it("has nothing to say without a character name", () => {
    expect(sectionProvenance([turn(2, "section item added: Mika → [Likes] tea")], "").size).toBe(0);
  });
});
