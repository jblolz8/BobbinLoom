/** Heading → id mapping and the nearest-heading lookup, both shared by the docs
 *  renderer (which writes the ids) and the docs search (which points a hit at
 *  its heading). One implementation, because two would drift into anchors that
 *  scroll nowhere. */
import { describe, expect, it } from "vitest";
import { nearestHeading, slugifyHeading } from "../src/engine/docsHeadings";

describe("slugifyHeading", () => {
  it("matches the ids the docs renderer emits", () => {
    expect(slugifyHeading("Measuring: estimate vs measured")).toBe("measuring-estimate-vs-measured");
    expect(slugifyHeading("(POV / Scene)")).toBe("pov--scene"); // runs are NOT collapsed
    expect(slugifyHeading("Multi-character regions (Forge Couple)")).toBe("multi-character-regions-forge-couple");
  });

  it("strips anything outside [a-z0-9 -] and trims", () => {
    expect(slugifyHeading("  Trailing space  ")).toBe("trailing-space");
    expect(slugifyHeading("Emoji 🎨 and digits 42")).toBe("emoji--and-digits-42");
  });
});

describe("nearestHeading", () => {
  const body = "# One\n\ntext\n\n## Two\n\nlong text\n";

  it("returns the last heading at or before the index", () => {
    expect(nearestHeading(body, body.indexOf("long text"))).toEqual({ text: "Two", slug: "two" });
    expect(nearestHeading(body, body.indexOf("\ntext\n"))).toEqual({ text: "One", slug: "one" });
  });

  it("is null when the hit precedes every heading", () => {
    expect(nearestHeading("\n\nplain text\n", 3)).toBeNull();
  });

  it("ignores a '#' inside a fenced block's content line", () => {
    const fenced = "# Real\n\n```sh\n# not a heading\n```\n";
    expect(nearestHeading(fenced, fenced.indexOf("not a heading"))?.slug).toBe("real");
  });
});
