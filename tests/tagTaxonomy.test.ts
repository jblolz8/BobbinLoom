import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CATEGORIES,
  discoverLibraryNamespaces,
  groupTagsByCategory,
  resolveTagStyle,
  type TagTaxonomyConfig,
} from "../src/engine/tagTaxonomy";
import { loadAppSettings, saveAppSettings } from "../src/server/appSettingsStore";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("tagTaxonomy engine", () => {
  describe("resolveTagStyle", () => {
    it("classifies standalone rating tags correctly", () => {
      const nsfwStyle = resolveTagStyle("nsfw");
      expect(nsfwStyle.categoryId).toBe("rating_nsfw");
      expect(nsfwStyle.namespace).toBeUndefined();
      expect(nsfwStyle.value).toBe("nsfw");
      expect(nsfwStyle.colors.text).toBe("#f87171");

      const sfwStyle = resolveTagStyle("sfw");
      expect(sfwStyle.categoryId).toBe("rating_sfw");
      expect(sfwStyle.colors.text).toBe("#4ade80");

      const explicitStyle = resolveTagStyle("explicit");
      expect(explicitStyle.categoryId).toBe("rating_nsfw");

      const safeStyle = resolveTagStyle("safe");
      expect(safeStyle.categoryId).toBe("rating_sfw");
    });

    it("classifies built-in namespace prefixes correctly", () => {
      const speciesStyle = resolveTagStyle("species:cat-girl");
      expect(speciesStyle.categoryId).toBe("species");
      expect(speciesStyle.namespace).toBe("species");
      expect(speciesStyle.value).toBe("cat-girl");
      expect(speciesStyle.categoryLabel).toBe("Species & Race");
      expect(speciesStyle.colors.text).toBe("#22d3ee");

      const copyrightStyle = resolveTagStyle("copyright:my-little-pony");
      expect(copyrightStyle.categoryId).toBe("copyright");
      expect(copyrightStyle.namespace).toBe("copyright");
      expect(copyrightStyle.value).toBe("my-little-pony");
      expect(copyrightStyle.categoryLabel).toBe("Copyright & Franchise");
      expect(copyrightStyle.colors.text).toBe("#c084fc");

      const artistStyle = resolveTagStyle("artist:wlop");
      expect(artistStyle.categoryId).toBe("artist");
      expect(artistStyle.namespace).toBe("artist");
      expect(artistStyle.value).toBe("wlop");
      expect(artistStyle.colors.text).toBe("#fbbf24");

      const characterStyle = resolveTagStyle("char:miku");
      expect(characterStyle.categoryId).toBe("character");
      expect(characterStyle.namespace).toBe("char");
      expect(characterStyle.value).toBe("miku");
      expect(characterStyle.colors.text).toBe("#60a5fa");

      const ratingStyle = resolveTagStyle("rating:nsfw");
      expect(ratingStyle.categoryId).toBe("rating_nsfw");
      expect(ratingStyle.colors.text).toBe("#f87171");

      const ratingSfwStyle = resolveTagStyle("rating:sfw");
      expect(ratingSfwStyle.categoryId).toBe("rating_sfw");
      expect(ratingSfwStyle.colors.text).toBe("#4ade80");
    });

    it("supports custom user categories and custom namespace prefixes", () => {
      const customConfig: TagTaxonomyConfig = {
        customCategories: [
          {
            id: "faction",
            label: "Faction / Clan",
            prefixes: ["faction", "clan", "house"],
            color: "#e879f9",
          },
        ],
        tagOverrides: {},
      };

      const clanStyle = resolveTagStyle("clan:uchiha", customConfig);
      expect(clanStyle.categoryId).toBe("faction");
      expect(clanStyle.namespace).toBe("clan");
      expect(clanStyle.value).toBe("uchiha");
      expect(clanStyle.categoryLabel).toBe("Faction / Clan");
      expect(clanStyle.colors.text).toBe("#e879f9");

      const houseStyle = resolveTagStyle("house:atreides", customConfig);
      expect(houseStyle.categoryId).toBe("faction");
      expect(houseStyle.value).toBe("atreides");
      expect(houseStyle.colors.text).toBe("#e879f9");
    });

    it("prioritizes specific tag overrides over prefix rules", () => {
      const config: TagTaxonomyConfig = {
        customCategories: [],
        tagOverrides: {
          gore: "rating_nsfw",
          "species:special": "#ff0077",
        },
      };

      const goreStyle = resolveTagStyle("gore", config);
      expect(goreStyle.categoryId).toBe("rating_nsfw");
      expect(goreStyle.colors.text).toBe("#f87171");

      const specialStyle = resolveTagStyle("species:special", config);
      expect(specialStyle.colors.text).toBe("#ff0077");
    });

    it("falls back to stable HSL hashing for un-namespaced general tags", () => {
      const tag1 = resolveTagStyle("solo");
      const tag2 = resolveTagStyle("solo");
      expect(tag1.categoryId).toBe("general");
      expect(tag1.colors.text).toBe(tag2.colors.text);
      expect(tag1.colors.bg).toBe(tag2.colors.bg);
      expect(tag1.colors.border).toBe(tag2.colors.border);
    });
  });

  describe("groupTagsByCategory", () => {
    it("groups a list of tags with counts into ordered category buckets", () => {
      const tagsWithCounts = [
        { tag: "nsfw", count: 10 },
        { tag: "species:elf", count: 8 },
        { tag: "species:cat-girl", count: 5 },
        { tag: "copyright:touhou", count: 4 },
        { tag: "solo", count: 12 },
        { tag: "maid", count: 6 },
      ];

      const groups = groupTagsByCategory(tagsWithCounts);
      const groupIds = groups.map((g) => g.id);

      expect(groupIds).toContain("rating_nsfw");
      expect(groupIds).toContain("species");
      expect(groupIds).toContain("copyright");
      expect(groupIds).toContain("general");

      const speciesGroup = groups.find((g) => g.id === "species");
      expect(speciesGroup?.tags).toHaveLength(2);
      expect(speciesGroup?.tags[0].tag).toBe("species:elf");
      expect(speciesGroup?.tags[1].tag).toBe("species:cat-girl");

      const ratingGroup = groups.find((g) => g.id === "rating_nsfw");
      expect(ratingGroup?.tags).toHaveLength(1);
      expect(ratingGroup?.tags[0].tag).toBe("nsfw");
    });
  });

  describe("discoverLibraryNamespaces", () => {
    it("extracts and tallies unique namespace prefixes from character cards", () => {
      const libraryTags = [
        "species:elf",
        "species:dragon",
        "species:cat-girl",
        "copyright:zelda",
        "copyright:mario",
        "clan:senju",
        "solo",
        "nsfw",
      ];

      const discovered = discoverLibraryNamespaces(libraryTags);
      expect(discovered).toEqual([
        { prefix: "species", count: 3, sampleTag: "species:cat-girl" },
        { prefix: "copyright", count: 2, sampleTag: "copyright:mario" },
        { prefix: "clan", count: 1, sampleTag: "clan:senju" },
      ]);
    });
  });

  describe("appSettingsStore persistence with tagTaxonomy", () => {
    it("saves and loads custom tagTaxonomy configuration", () => {
      const dir = mkdtempSync(join(tmpdir(), "bobbinloom-tax-test-"));
      try {
        const taxonomyConfig: TagTaxonomyConfig = {
          customCategories: [
            {
              id: "world",
              label: "World",
              prefixes: ["world", "realm"],
              color: "#38bdf8",
            },
          ],
          tagOverrides: {
            lewd: "rating_nsfw",
          },
        };

        saveAppSettings(dir, {
          tagTaxonomy: taxonomyConfig,
        });

        const loaded = loadAppSettings(dir);
        expect(loaded.tagTaxonomy).toEqual(taxonomyConfig);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
