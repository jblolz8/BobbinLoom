import { z } from "zod";
import { DEFAULT_IMAGE_PROMPT_INSTRUCTION, IMAGE_HISTORY_MESSAGES, IMAGE_HISTORY_MESSAGES_MAX, IMAGE_PROMPT_CHARACTER_LIMIT } from "../engine/imageDefaults";

export const ClothingItemSchema = z.object({
  slot: z.string(),
  name: z.string(),
  state: z.string().optional()
});
export type ClothingItem = z.infer<typeof ClothingItemSchema>;


// ── Lorebook (SillyTavern-compatible World Info) ──
export const LorebookEntrySchema = z.object({
  uid: z.number(),
  key: z.array(z.string()).default([]),
  keysecondary: z.array(z.string()).default([]),
  content: z.string().default(""),
  comment: z.string().default(""),
  constant: z.boolean().default(false),
  selective: z.boolean().default(false),
  selectiveLogic: z.number().int().min(0).max(3).default(0),
  scanDepth: z.number().int().nullable().default(null),
  caseSensitive: z.boolean().default(false),
  matchWholeWords: z.boolean().default(false),
  useRegex: z.boolean().default(false),
  useProbability: z.boolean().default(false),
  probability: z.number().int().min(0).max(100).default(100),
  sticky: z.number().int().min(0).default(0),
  cooldown: z.number().int().min(0).default(0),
  delay: z.number().int().min(0).default(0),
  order: z.number().int().default(100),
  position: z.number().int().min(0).max(2).default(0),
  depth: z.number().int().min(0).default(4),
  disable: z.boolean().default(false),
  group: z.string().default(""),
  groupWeight: z.number().int().default(100),
  preventRecursion: z.boolean().default(false),
  excludeRecursion: z.boolean().default(false),
  delayUntilRecursion: z.boolean().default(false),
});
export type LorebookEntry = z.infer<typeof LorebookEntrySchema>;

export const LorebookFileSchema = z.object({
  name: z.string().min(1),
  scanDepth: z.number().int().min(0).default(2),
  caseSensitive: z.boolean().default(false),
  matchWholeWords: z.boolean().default(false),
  entries: z.record(z.string(), LorebookEntrySchema).default({}),
});
export type LorebookFile = z.infer<typeof LorebookFileSchema>;

export const LorebookSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  entryCount: z.number().int(),
  scanDepth: z.number().int(),
});
export type LorebookSummary = z.infer<typeof LorebookSummarySchema>;

export const EntryTimingStateSchema = z.object({
  lastActivatedAt: z.number().nullable(),
  stickyCount: z.number().int().min(0),
  cooldownRemaining: z.number().int().min(0),
  delayRemaining: z.number().int().min(0),
});
export type EntryTimingState = z.infer<typeof EntryTimingStateSchema>;
// ── End Lorebook schemas ──

export const CharacterTemplateSchema = z.object({
  id: z.string(),
  lineageId: z.string().optional(),
  name: z.string(),
  version: z.number(),
  content: z.string(),
  summary: z.string().default(""),
  startingClothing: z.array(ClothingItemSchema).default([]),
  // CCv2 card metadata. ALL fields are .optional() (NO .default()) — typed
  // literals like DEMO_TEMPLATE must keep parsing; zod .default() would make
  // fields REQUIRED in the output type. Writes stamp explicitly
  // (createCharacterTemplateRecord, importCharacterCard); readers use
  // (t.tags ?? []) / (t.extensions ?? {}).
  spec: z.literal("bobbinloom_chara").optional(),
  specVersion: z.string().optional(),
  title: z.string().optional(),
  creatorNotes: z.string().optional(),
  creator: z.string().optional(),
  tags: z.array(z.string()).optional(),
  extensions: z.record(z.any()).optional(),
  format: z.literal("ccv2").optional(),
  cardRef: z.object({ file: z.string(), kind: z.enum(["png", "json"]) }).optional(),
  cardVersion: z.string().optional(),
  scenario: z.string().optional(),
  ccv2Content: z.string().optional(),
  ccv2CreatorNotes: z.string().optional(),
  ccv2Tags: z.array(z.string()).optional(),
  customPortrait: z.string().optional(),
  profileImage: z.string().optional(),
  avatarUpdatedAt: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CharacterTemplate = z.infer<typeof CharacterTemplateSchema>;

export const LocationEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  state: z.string().default(""),
  icon: z.string().default("📍"),
  connections: z.array(z.string()).default([]),
  x: z.number().default(0),
  y: z.number().default(0),
});
export type LocationEntry = z.infer<typeof LocationEntrySchema>;

export const InventoryRefSchema = z.object({
  itemId: z.string(),
  quantity: z.number(),
  equippedBy: z.string().optional()
});
export type InventoryRef = z.infer<typeof InventoryRefSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  stackable: z.boolean()
});
export type Item = z.infer<typeof ItemSchema>;


export const CharacterInstanceSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  playthroughId: z.string(),
  branchId: z.string(),
  name: z.string(),
  currentLocationId: z.string(),
  mood: z.string(),
  towardPlayer: z.string(),
  memorySummary: z.string(),
  conditions: z.array(z.string()),
  flags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  clothing: z.array(ClothingItemSchema).default([])
});
export type CharacterInstance = z.infer<typeof CharacterInstanceSchema>;

export const PlayerCharacterSchema = z.object({
  name: z.string(),
  description: z.string(),
  bodyType: z.string(),
  appearance: z.string(),
  clothing: z.array(ClothingItemSchema),
  conditions: z.array(z.string()),
  flags: z.array(z.string())
});
export type PlayerCharacter = z.infer<typeof PlayerCharacterSchema>;

export const PlayerPersonaSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  bodyType: z.string(),
  appearance: z.string(),
  initialClothing: z.array(ClothingItemSchema),
  isDefault: z.boolean()
});
export type PlayerPersona = z.infer<typeof PlayerPersonaSchema>;

export const ProviderKindSchema = z.enum(["text", "image"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/** Endpoint dialect for image connections. `openai` = POST /images/generations
 *  (no negative prompt, 1500-char prompt cap); `venice` = POST /image/generate
 *  (negative_prompt, seed, variants, style_preset, safe_mode); `a1111` =
 *  AUTOMATIC1111 / Forge's native /sdapi/v1 API, served from the WebUI ROOT
 *  (no /v1 prefix), with the checkpoint chosen per request. */
export const ImageApiStyleSchema = z.enum(["openai", "venice", "a1111"]);
export type ImageApiStyle = z.infer<typeof ImageApiStyleSchema>;

/** Which way Forge Couple splits the canvas, in its OWN spelling: the value
 *  goes on the wire verbatim (`direction` in the 17-argument alwayson
 *  payload), so the union is case-sensitive on purpose. */
export const RegionDirectionSchema = z.enum(["Horizontal", "Vertical"]);
export type RegionDirection = z.infer<typeof RegionDirectionSchema>;

export const ProviderConnectionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  contextWindow: z.number(),
  /** Registry v2 discriminator. `.default()` is deliberate and NOT a slip: it
   *  makes `kind` required on the OUTPUT type, so every construction site has
   *  to stamp it and tsc catches the ones that forget. */
  kind: ProviderKindSchema.default("text"),
  // ── image-only; absent on text rows ──
  apiStyle: ImageApiStyleSchema.optional(),
  /** A1111 sampling controls. Absent = the adapter omits the field and the
   *  WebUI applies its own default, which is the right behaviour for a fork
   *  whose defaults the user has already tuned in the WebUI. */
  steps: z.number().int().min(1).max(150).optional(),
  cfgScale: z.number().min(0).max(30).optional(),
  /** Free text, validated against the server's own list in the UI (a fork may
   *  ship samplers we do not know). */
  sampler: z.string().optional(),
  scheduler: z.string().optional(),
  /** Per-connection request timeout in ms. Absent = the dialect default
   *  (10 min for a1111, 180 s otherwise), which the env var can still override. */
  timeoutMs: z.number().int().min(1000).optional(),
  /** Forge Couple regions (a1111 only): give each character in frame its own
   *  attention region so traits stop bleeding between them. Absent = ON: the
   *  normal flow auto-engages, and only when the composed prompt has 2 or more
   *  ` | ` groups AND the WebUI really has the extension (detected, never
   *  assumed); `false` turns regions off for this connection. */
  regionsEnabled: z.boolean().optional(),
  /** Which way the regions split. Absent = Horizontal (blocks map left to
   *  right). */
  regionDirection: RegionDirectionSchema.optional(),
  /** true = ask the provider to blur/moderate adult content. Absent = false:
   *  this app is an adult-content project and the blur is a footgun. */
  safeMode: z.boolean().optional(),
  /** "auto" | "1024x1024" | "1536x1024" | … mapped per adapter. */
  size: z.string().optional(),
  /** Models that reject width/height (Venice qwen-image family) take this. */
  aspectRatio: z.string().optional(),
  /** Text connection that writes the image prompt; absent/null = active text. */
  promptProviderId: z.string().nullable().optional(),
  // Venice-native pass-throughs
  stylePreset: z.string().optional(),
  hideWatermark: z.boolean().optional(),
  variants: z.number().int().min(1).max(4).optional(),
  /** Integer seed sent with every image call this connection makes (Venice's
   *  `seed`). When set, re-rolls of the same prompt are comparable: the same
   *  seed and prompt reproduce the same image. Absent — or 0, which Venice
   *  documents as "pick one at random" — lets the provider choose and stores no
   *  seed on the image. Not every dialect supports one: the OpenAI-compatible
   *  images API has no seed field, so it is simply ignored there. */
  seed: z.number().int().optional(),
  readonly: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastActiveAt: z.string().optional()
});
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;

export const ProviderRegistryFileSchema = z.object({
  schemaVersion: z.number().int().min(1).default(2),
  activeTextProviderId: z.string().default(""),
  activeImageProviderId: z.string().default(""),
  /** The text connection that CREATES new playthroughs — the scenario seed and the
   *  opening turn. Absent or null follows whichever text connection is active, the
   *  same rule a connection's `promptProviderId` uses. Optional, so a registry
   *  written before this preference parses untouched. */
  generationTextProviderId: z.string().nullable().optional(),
  /** The text connection that CLOSES chapters — the summary call and the chapter-opening turn.
   *  Optional and nullable for the same reason as the generation preference above: absent or
   *  null follows whichever text connection is active, and a registry written before this
   *  preference exists parses untouched. */
  chapterTextProviderId: z.string().nullable().optional(),
  connections: z.array(ProviderConnectionSchema)
});
export type ProviderRegistryFile = z.infer<typeof ProviderRegistryFileSchema>;

export const CustomCategoryConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  prefixes: z.array(z.string()).default([]),
  color: z.string(),
  colorLight: z.string().optional(),
  description: z.string().optional(),
});
export type CustomCategoryConfig = z.infer<typeof CustomCategoryConfigSchema>;

export const TagTaxonomyConfigSchema = z.object({
  customCategories: z.array(CustomCategoryConfigSchema).default([]),
  tagOverrides: z.record(z.string()).default({}),
});
export type TagTaxonomyConfig = z.infer<typeof TagTaxonomyConfigSchema>;

export const AvatarShapeSchema = z.enum(["square", "rounded", "circle"]);

/** The shape of every cover frame on the playthrough shelf. A display preference, chosen to
 *  suit the images a story actually produced: generated renders are usually square while
 *  character art is portrait, so the frame follows whichever the user is looking at. */
export const CoverAspectSchema = z.enum(["portrait", "square", "landscape"]);
export type CoverAspect = z.infer<typeof CoverAspectSchema>;
export type AvatarShape = z.infer<typeof AvatarShapeSchema>;

export const ThemeModeSchema = z.enum(["dark", "light", "system"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const CustomThemeColorsSchema = z.record(z.string());
export type CustomThemeColors = z.infer<typeof CustomThemeColorsSchema>;

export const SimpleNPCSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  disposition: z.string().optional(),
  locationId: z.string(),
  createdAt: z.string()
});
export type SimpleNPC = z.infer<typeof SimpleNPCSchema>;

export const QuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  tracking: z.boolean(),
  status: z.enum(["active", "completed", "failed"])
});
export type Quest = z.infer<typeof QuestSchema>;

export const MODULE_CONTEXTS = ["turn"] as const;
export type ModuleContext = (typeof MODULE_CONTEXTS)[number];

export const PromptPresetModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  content: z.string(),
  order: z.number(),
  enabled: z.boolean()
});
export type PromptPresetModule = z.infer<typeof PromptPresetModuleSchema>;

/** Modules are grouped by prompt context structurally (turn/seed/sheet/summary):
 *  the tab a module is edited under IS its context — no per-module context field.
 *  Legacy presets/snapshots stored modules as a flat array (pre-Aug 2026);
 *  a flat array is treated as turn modules, and a partial record gets its
 *  missing arrays filled with []. */
export const PromptModuleSetSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return { turn: val };
    if (typeof val === "object" && val !== null) {
      return { turn: [], ...(val as Record<string, unknown>) };
    }
    return val;
  },
  z.object({
    turn: z.array(PromptPresetModuleSchema)
  })
);
export type PromptModuleSet = z.infer<typeof PromptModuleSetSchema>;
export const EMPTY_MODULE_SET: PromptModuleSet = { turn: [] };

// ── Character format (preset-owned sheet structure) ──
// The ordered list of sections a character sheet should contain. Each section
// carries generation guidance (instruction + optional examples) and an optional
// `inline` flag (render as `[Name]: value` on one line instead of a block).
// The list is open-ended: extra sections beyond a preset's list are always
// allowed in sheets — the format drives defaults, order, and guidance, never a
// rejection whitelist.
export const CharacterFormatSectionSchema = z.object({
  name: z.string().min(1),
  order: z.number(),
  instruction: z.string().default(""),
  examples: z.array(z.string()).default([]),
  /** Multi-line sample BODY for this section, as it should appear in a finished
   *  sheet. Unlike `examples` (one entry per line, rendered by buildFormatRules
   *  as the bullet list of expected content), this field may contain real
   *  newlines and is what the sample sheet in generation prompts shows. Empty
   *  falls back to examples[0]. */
  exampleBody: z.string().default(""),
  inline: z.boolean().default(false),
});
export type CharacterFormatSection = z.infer<typeof CharacterFormatSectionSchema>;

export const CharacterFormatSchema = z.object({
  sections: z.array(CharacterFormatSectionSchema).default([]),
});
export type CharacterFormat = z.infer<typeof CharacterFormatSchema>;

// ── Image generation (preset-owned prompt config) ──
// The inner fields carry `.default()` so a PARTIAL block always parses to a
// complete one; the field on the preset/snapshot is `.optional()` with no
// default, so every existing preset and playthrough keeps parsing and read
// sites fall back to DEFAULT_IMAGE_GENERATION_SETTINGS explicitly.
/** Which perspective the image instruction writes from. `pov` is the POV
 *  document the shipped presets have always carried; `scene` swaps the
 *  perspective rules for their third-person counterparts and (at call time)
 *  drops the player from the context. Kept as a field on the block rather than
 *  as extra preset entries, so the instruction text stays one source of truth
 *  (see `applyInstructionMode`). */
export const ImageInstructionModeSchema = z.enum(["pov", "scene"]);
export type ImageInstructionMode = z.infer<typeof ImageInstructionModeSchema>;

export const ImageGenerationSettingsSchema = z.object({
  instruction: z.string().default(DEFAULT_IMAGE_PROMPT_INSTRUCTION),
  instructionMode: ImageInstructionModeSchema.default("pov"),
  positivePrefix: z.string().default(""),
  negativePrefix: z.string().default(""),
  // Sourced from the shipped limit so a partial block can never default to a stale
  // number while the presets and the fallback say something else.
  promptCharacterLimit: z.number().int().min(0).default(IMAGE_PROMPT_CHARACTER_LIMIT),
  includeState: z.boolean().default(true),
  includeCast: z.boolean().default(true),
  // Same convention as the two flags above: the READ-TIME default is the shipped
  // value, so a snapshot written before these fields existed behaves like a preset
  // that ships them. A playthrough therefore gains history context on its next
  // image with no other change — intended, and documented.
  historyMessages: z.number().int().min(0).max(IMAGE_HISTORY_MESSAGES_MAX).default(IMAGE_HISTORY_MESSAGES),
  /** Give the prompt writer ONE earlier answer as a SHAPE reference. OFF by
   *  default: an in-context example anchors a tag model, so it is opt-in. */
  includePreviousAnswer: z.boolean().default(false)
});
export type ImageGenerationSettings = z.infer<typeof ImageGenerationSettingsSchema>;

export const PromptPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  readonly: z.boolean(),
  modules: PromptModuleSetSchema,
  characterFormat: CharacterFormatSchema.optional(),
  imageGeneration: ImageGenerationSettingsSchema.optional()
});
export type PromptPreset = z.infer<typeof PromptPresetSchema>;

// ── Global prompt config (the single, always-applied working copy) ──
// The live configuration every playthrough reads at generation time. It is a
// full copy of a preset's `modules` / `characterFormat` / `imageGeneration`,
// persisted in app settings, and it may carry UNSAVED edits (it is the draft —
// there is no separate dirty object). "Saved" means the copy has been pushed
// back into a named preset; "dirty" is computed by comparing this to its
// backing preset (`activePresetId`), never stored.
export const PromptConfigSchema = z.object({
  modules: PromptModuleSetSchema,
  characterFormat: CharacterFormatSchema.optional(),
  imageGeneration: ImageGenerationSettingsSchema.optional()
});
export type PromptConfig = z.infer<typeof PromptConfigSchema>;

/** How the NEXT chapter opens, chosen when a chapter is closed.
 *
 *  A zod enum is right here on purpose: this value is chosen by the CLIENT, never written by the
 *  model — the free-form-string rule is about fields the model fills. The matching labels, blurbs
 *  and prompt fragments live with it in `engine/chapterLifecycle.ts`, so the route's enum, the
 *  modal's options and the instruction text cannot drift apart. */
export const ChapterOpeningModeSchema = z.enum(["continuation", "shortJump", "longJump", "custom"]);
export type ChapterOpeningMode = z.infer<typeof ChapterOpeningModeSchema>;

/**
 * The reader's display preferences: every list's view mode and sort, the chat's toggles, the
 * play-nav tabs, the stale-note dismissals. One group per surface that owns one, and every LEAF is
 * optional — a settings file written before a group existed parses untouched (no `dataMigrations`
 * entry) and, more importantly, an ABSENT leaf means "never chosen", which is what lets the one-shot
 * `planAdoption` tell "not migrated yet" from "chosen equal to the default".
 *
 * The wire deliberately carries only what was chosen: `/api/settings/preferences` does not fill
 * defaults the way the appearance route does, and the client resolves them in one place.
 */
/** How many rows a list shows. `"all"` is the engine's sentinel for "show everything" — a real choice
 *  rather than a number, so it is part of the type. */
export const PageSizeSchema = z.union([z.number().int().positive(), z.literal("all")]);

export const ViewPreferencesSchema = z.object({
  /** The Chat tab's display toggles. Leaves mirror the client's own field names one for one, so a
   *  migrated toggle needs no translation table and the hook's per-field writers can send the single
   *  leaf they just changed. */
  chat: z
    .object({
      choicesEnabled: z.boolean().optional(),
      showDebug: z.boolean().optional(),
      showContextUsage: z.boolean().optional(),
      showGenerationTime: z.boolean().optional(),
      showMessageTimestamps: z.boolean().optional(),
      showModelName: z.boolean().optional(),
      imagePromptPreview: z.boolean().optional(),
      autoImageAfterTurn: z.boolean().optional(),
      alwaysDiscardOldImage: z.boolean().optional()
    })
    .optional(),
  library: z
    .object({
      /** The character library's list. Enums rather than bare strings, so a hand-edited settings file
       *  cannot put a layout the UI has no branch for into the store — the route answers 400. */
      viewMode: z.enum(["portrait", "list", "grid"]).optional(),
      sortBy: z.enum(["name", "createdAt", "updatedAt"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
      sidebarViewMode: z.enum(["grouped", "flat"]).optional(),
      /** Category ids whose sidebar groups are collapsed. An array, not a Set: this is JSON. */
      collapsedCategories: z.array(z.string()).optional(),
      search: z.string().optional(),
      /** The home shelf's cards — a different list from the library's, so its leaves are prefixed
       *  rather than sharing names that would collide with the library's own. */
      playthroughViewMode: z.enum(["grid", "list"]).optional(),
      playthroughSortBy: z.enum(["updatedAt", "name", "turn"]).optional(),
      playthroughSortDir: z.enum(["asc", "desc"]).optional()
    })
    .optional(),
  /** How many rows each list shows, one leaf per pager. Deliberately NOT inside `library`: three of the
   *  five surfaces that page are not the library, and all five share one hook. */
  pageSizes: z
    .object({
      library: PageSizeSchema.optional(),
      lorebook: PageSizeSchema.optional(),
      persona: PageSizeSchema.optional(),
      setupCast: PageSizeSchema.optional(),
      home: PageSizeSchema.optional()
    })
    .optional(),
  setup: z
    .object({
      castSearch: z.string().optional(),
      castSortBy: z.string().optional(),
      castSortDir: z.string().optional(),
      castViewMode: z.string().optional(),
      showTagFilters: z.boolean().optional()
    })
    .optional(),
  cast: z.object({ viewMode: z.string().optional() }).optional(),
  providers: z
    .object({
      sortBy: z.string().optional(),
      sortDir: z.string().optional()
    })
    .optional(),
  nav: z.object({ showPlayNavTabs: z.boolean().optional() }).optional(),
  /** Chapter id → the stale-summary note's dismissal. UI ephemera that happens to grow; it moves
   *  only so nothing preference-shaped is left on the device. */
  staleNoteDismissals: z.record(z.string(), z.string()).optional()
});
export type ViewPreferences = z.infer<typeof ViewPreferencesSchema>;

export const AppSettingsSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  // The preset backing the global prompt config (renamed from defaultPresetId:
  // it no longer means "default for new playthroughs" — there is one active
  // config for everything).
  activePresetId: z.string().optional(),
  promptConfig: PromptConfigSchema.optional(),
  tagTaxonomy: TagTaxonomyConfigSchema.optional(),
  avatarShape: AvatarShapeSchema.optional(),
  coverAspect: CoverAspectSchema.optional(),
  themeMode: ThemeModeSchema.optional(),
  themePreset: z.string().optional(),
  customThemeColors: CustomThemeColorsSchema.optional(),
  /** The last chapter-opening mode the player chose. Optional, so a settings file written before
   *  this preference parses untouched and no `dataMigrations` entry is needed. */
  chapterOpeningMode: ChapterOpeningModeSchema.optional(),
  /** The brainstorm assistant's preferences, optional for the same reason: an old settings file
   *  parses untouched, and `null`/absent means "follow the active connection". */
  brainstormIncludeOriginalCard: z.boolean().optional(),
  brainstormTextProviderId: z.string().nullable().optional(),
  /** Whether the assistant may propose a section the format does not list. True by default: the
   *  sheet machinery appends unknown sections and `isFormatAligned` only checks that the format's own
   *  sections are present and in order, so an addition costs nothing. */
  brainstormAllowNewSections: z.boolean().optional(),
  /** Whether a horizontal swipe moves between the play view's panels on the single-panel layout.
   *  Optional like the other display preferences, so a settings file written before this parses
   *  untouched and no `dataMigrations` entry is needed; absent means on, and the bottom tab bar
   *  works either way. */
  paneSwipeEnabled: z.boolean().optional(),
  /** The reader's display preferences. Optional like every other display field, so a settings file
   *  written before this parses untouched — and each LEAF stays individually absent until it is
   *  actually chosen, which is the signal the one-shot adoption reads. */
  viewPreferences: ViewPreferencesSchema.optional(),
  updatedAt: z.string().optional()
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;


export const MemoryEventSchema = z.object({
  id: z.string(),
  playthroughId: z.string(),
  branchId: z.string(),
  characterInstanceId: z.string().optional(),
  turn: z.number(),
  type: z.string(),
  summary: z.string(),
  importance: z.number(),
  tags: z.array(z.string()),
  chapterId: z.string().optional(),
  /** Cached embedding vector for semantic retrieval. Computed once per event
   *  after the turn that creates it. Absent on older events or when the
   *  embedding API is unavailable — keyword fallback handles those. */
  embedding: z.array(z.number()).optional(),
  createdAt: z.string()
});
export type MemoryEvent = z.infer<typeof MemoryEventSchema>;

/** One generated image attached to an assistant message. `file` is a
 *  content-addressed name under data/images/ ("<sha256>.<ext>"); the bytes are
 *  shared, never owned, because branching structuredClones messages by value. */
export const MessageImageSchema = z.object({
  /** "<sha256>.<ext>" — content-addressed file under data/images/. */
  file: z.string(),
  prompt: z.string().default(""),
  negativePrompt: z.string().optional(),
  providerId: z.string().default(""),
  model: z.string().default(""),
  seed: z.number().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /** How long the PROMPT side call took, when one ran — the text provider's
   *  half of the result, kept separate from `durationMs` (the render).
   *  With "Review Image Prompt Before Generating" ON, the prompt is written by
   *  the dry-run call and the generate request makes no text call at all, so
   *  the client echoes the measured value back through the generate body for
   *  the ref to carry it. OPTIONAL, and deliberately no `.default()`: a default
   *  makes the field REQUIRED in `z.infer` and breaks every ref literal in the
   *  repo (the zod `.default()` trap). */
  promptDurationMs: z.number().int().nonnegative().optional(),
  /** The prompt call's OWN answer: the model's tag line before the preset's
   *  positive prefix and any clamping were applied. Stored so a later image can be
   *  handed ONE earlier answer as a shape reference, and so the raw answer is
   *  readable without re-parsing the fenced JSON inside `promptResponse`.
   *  OPTIONAL, deliberately no `.default()` — a default makes the field required in
   *  `z.infer` and breaks every ref literal in the repo (the zod `.default()`
   *  trap already documented on the field above). Absent when no text call ran and
   *  nothing was echoed back (the both-overrides path from an older client). */
  writerPrompt: z.string().optional(),
  writerNegative: z.string().optional(),
  /** Diagnostic provenance: the EXACT JSON request body that was sent to the
   *  image provider for this image. Body only — never headers, never the API
   *  key. Present so a stored image can answer "what did we actually send?".
   *  OPTIONAL so every ref written before this field parses untouched. */
  request: z.string().optional(),
  /** Diagnostic provenance for the PROMPT side call: the JSON body sent to the
   *  text provider that wrote this image's prompt. SAME rules as `request` —
   *  body only, never headers, never the API key. Absent when the prompt never
   *  went through the text model (both prompt overrides were supplied).
   *  OPTIONAL so every ref written before this field parses untouched. */
  promptRequest: z.string().optional(),
  /** The prompt side call's RESPONSE, body only, as the text provider returned
   *  it (chat-completion envelope). Truncated before it is stored so a verbose
   *  reasoning model cannot bloat the playthrough record. Optional like the
   *  rest of the provenance fields. */
  promptResponse: z.string().optional(),
  createdAt: z.string()
});
export type MessageImage = z.infer<typeof MessageImageSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  hidden: z.boolean().optional(),
  chapterId: z.string().optional(),
  /** The story turn during which this message was added. Enables mapping to TurnSnapshots. */
  turn: z.number().optional(),
  /** Marks the assistant message that opens a new chapter after the previous
   *  chapter was archived. Drives the "Re-summarize previous chapter" action. */
  chapterOpening: z.boolean().optional(),
  /** Generated images attached to this message (assistant messages only).
   *  OPTIONAL so every record written before this feature parses untouched. */
  images: z.array(MessageImageSchema).optional(),
  /** What this turn's statePatch actually did, recorded by executeTurn.
   *  OPTIONAL so every message written before this feature parses untouched.
   *  Powers a Debug-panel view that survives a reload, and makes an
   *  emitted-but-rejected patch visible after the fact — patch feedback is
   *  deliberately never re-injected into the prompt. */
  patchInfo: z.object({
    applied: z.array(z.string()).default([]),
    rejected: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([])
  }).optional()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChapterSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortDescription: z.string(),
  fullSummary: z.string(),
  turnRange: z.object({
    start: z.number(),
    end: z.number()
  }),
  messageIds: z.array(z.string()),
  memoryEventIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  summaryDurationMs: z.number().int().nonnegative().optional()
});
export type Chapter = z.infer<typeof ChapterSchema>;

/** Rolling consolidation of older chapters into a single meta-summary. Caps the
 *  unbounded `STORY SO FAR` prompt section: only the most recent chapters are
 *  injected verbatim, everything older collapses into this meta-summary. */
export const ChapterMetaSummarySchema = z.object({
  id: z.string(),                  // "mch_xxx"
  chapterIds: z.array(z.string()), // ids of the Chapters folded into this meta-summary
  /** Turn range span covered (start = first folded chapter's turnRange.start,
   *  end = last folded chapter's turnRange.end), for display. */
  turnRange: z.object({
    start: z.number(),
    end: z.number()
  }),
  summary: z.string(),             // the rolling meta-summary text (injected into STORY SO FAR)
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ChapterMetaSummary = z.infer<typeof ChapterMetaSummarySchema>;

export const MemoryLayersSchema = z.object({
  recent: z.array(MemoryEventSchema),
  compressed: z.array(MemoryEventSchema)
});
export type MemoryLayers = z.infer<typeof MemoryLayersSchema>;

export const TurnSnapshotSchema = z.object({
  turn: z.number(),
  locationId: z.string(),
  flags: z.array(z.string()),
  playerCharacter: PlayerCharacterSchema,
  characters: z.array(CharacterInstanceSchema),
  characterTemplates: z.array(CharacterTemplateSchema),
  npcs: z.array(SimpleNPCSchema),
  inventory: z.array(InventoryRefSchema),
  quests: z.array(QuestSchema),
  locationCatalog: z.array(LocationEntrySchema).optional(),
  itemCatalog: z.array(ItemSchema).optional(),
  memoryEvents: z.array(MemoryEventSchema),
  memoryLayers: MemoryLayersSchema.optional(),
  lorebookIds: z.array(z.string()),
  lorebookTimingStates: z.record(z.number().or(z.string()), EntryTimingStateSchema).optional(),
  chapters: z.array(ChapterSchema).default([]),
  storyMetaSummaries: z.array(ChapterMetaSummarySchema).default([]),
  currentChapterStartedAtTurn: z.number().default(1),
});
export type TurnSnapshot = z.infer<typeof TurnSnapshotSchema>;

/** The player's manual cover choice for a playthrough: a reference to an image that
 *  already lives in the content-addressed store (`data/images/`). ABSENCE means "no
 *  manual choice" — `resolvePlaythroughCover` then falls back to the story's own
 *  images, then the present cast's portraits, then the placeholder mark.
 *
 *  Deliberately NOT a `TurnSnapshotSchema` field: cover art is presentation, not
 *  world state, so a Retry must not rewind it. */
export const PlaythroughCoverSchema = z.object({
  /** "<sha256>.<ext>" — content-addressed file under data/images/. */
  file: z.string(),
  updatedAt: z.string()
});
export type PlaythroughCover = z.infer<typeof PlaythroughCoverSchema>;

export const PlaythroughSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  id: z.string(),
  name: z.string(),
  branchId: z.string(),
  parentBranchId: z.string().optional(),
  rootPlaythroughId: z.string().optional(),
  isTimelineBranch: z.boolean().optional(),
  createdFromTurn: z.number().optional(),
  turn: z.number(),
  locationId: z.string(),
  flags: z.array(z.string()),
  playerCharacter: PlayerCharacterSchema,
  characters: z.array(CharacterInstanceSchema),
  characterTemplates: z.array(CharacterTemplateSchema),
  npcs: z.array(SimpleNPCSchema),
  inventory: z.array(InventoryRefSchema),
  quests: z.array(QuestSchema),
  locationCatalog: z.array(LocationEntrySchema).optional(),
  itemCatalog: z.array(ItemSchema).optional(),
  memoryEvents: z.array(MemoryEventSchema),
  memoryLayers: MemoryLayersSchema.optional(),
  messages: z.array(ChatMessageSchema),
  snapshots: z.record(z.string(), TurnSnapshotSchema).optional(),
  lorebookIds: z.array(z.string()).default([]),
  lorebookTimingStates: z.record(z.number().or(z.string()), EntryTimingStateSchema).optional(),
  chapters: z.array(ChapterSchema).default([]),
  storyMetaSummaries: z.array(ChapterMetaSummarySchema).default([]),
  currentChapterStartedAtTurn: z.number().default(1),
  // Creation-time metadata (for "Start New with same Scenario")
  scenarioDescription: z.string().optional(),
  personaId: z.string().optional(),
  initialCastIds: z.array(z.string()).optional(),
  // Per-playthrough input draft (client syncs a debounced copy; newer-wins vs
  // localStorage). Optional so pre-draft records parse untouched.
  draft: z.string().optional(),
  draftUpdatedAt: z.string().optional(),
  /** The player's manual cover choice; absence falls back to the resolver chain
   *  (latest image → present cast → placeholder). OPTIONAL, and deliberately no
   *  `.default()`: an additive optional field needs no `dataMigrations` entry and
   *  every record written before covers existed parses untouched. */
  cover: PlaythroughCoverSchema.optional(),
  // Measured/estimated prompt-token ratio from the last turn, fed back into the
  // next turn's budget. Deliberately NOT snapshotted (see TurnSnapshotSchema):
  // it measures the tokenizer, not world state, so a retry must not rewind it.
  tokenCalibration: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Playthrough = z.infer<typeof PlaythroughSchema>;
export const LoadFailureSchema = z.object({

  id: z.string(),
  name: z.string(),
  reason: z.string(),
  backupPath: z.string().optional(),
});
export type LoadFailure = z.infer<typeof LoadFailureSchema>;

/** Per-card projection for the playthrough list.
 *
 *  Deliberately NOT a `Partial<Playthrough>`: the list response must never carry messages,
 *  snapshots or the catalogs (they are ~90% of a document's bytes and no card reads them), and
 *  every field a card renders belongs here so a missing one is a compile error rather than a
 *  blank card. `locationName` is resolved server-side so the client needs no `locationCatalog`. */
/** A card's RESOLVED cover — what to render, and why that source won.
 *
 *  The stored `cover` is only ever the manual choice; the other sources are derived
 *  at read time. `source` travels on the wire so the UI can offer "Clear custom
 *  cover" for a manual one only. */
export const PlaythroughCoverViewSchema = z.object({
  source: z.enum(["manual", "latest", "cast"]),
  /** `manual` and `latest`: one content-addressed file under data/images/. */
  file: z.string().optional(),
  /** How many present cast have art, BEFORE the cap — a collage shows at most
   *  `COVER_COLLAGE_LIMIT` tiles, and the card says "+N" for the rest rather than
   *  pretending they are not there. */
  characterCount: z.number().optional(),
  /** `cast`: the present cast, in cast order, capped. The client builds each tile's
   *  URL from the character library's avatar route, which is why the id is what travels
   *  rather than a file name; `name` rides along for the tile's letter fallback, for the
   *  case where a character left the library after casting and its art 404s. */
  characters: z.array(z.object({
    id: z.string(),
    name: z.string().default(""),
    avatarUpdatedAt: z.number().optional()
  })).optional()
});
export type PlaythroughCoverView = z.infer<typeof PlaythroughCoverViewSchema>;

export const PlaythroughSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  turn: z.number(),
  locationName: z.string(),
  castCount: z.number(),
  /** Count of non-hidden messages; the card shows "No messages yet" at 0. */
  visibleMessageCount: z.number(),
  /** Last non-hidden message, truncated to 120 chars. Empty when there is none. */
  lastMessagePreview: z.string(),
  isTimelineBranch: z.boolean(),
  /** The resolved cover, or null to render the placeholder. Never null-of-error:
   *  a cover whose file is gone falls through to the next source instead. */
  cover: PlaythroughCoverViewSchema.nullable(),
  updatedAt: z.string(),
});
export type PlaythroughSummary = z.infer<typeof PlaythroughSummarySchema>;

export const PlaythroughListResponseSchema = z.object({
  playthroughs: z.array(PlaythroughSummarySchema),
  failures: z.array(LoadFailureSchema),
  /** Size of the filtered list. The pager's total: the client must not infer it from the array. */
  total: z.number(),
});
export type PlaythroughListResponse = z.infer<typeof PlaythroughListResponseSchema>;


export const ParsedUserInputSchema = z.object({
  raw: z.string(),
  actionText: z.string(),
  spokenText: z.array(z.string())
});
export type ParsedUserInput = z.infer<typeof ParsedUserInputSchema>;

export const InventoryPatchSchema = z.object({
  itemId: z.string(),
  quantity: z.number(),
  equippedBy: z.string().optional()
});


export const MemoryEventDraftSchema = z.object({
  characterInstanceId: z.string().optional(),
  type: z.string(),
  summary: z.string(),
  importance: z.number().default(1),
  tags: z.array(z.string()).default([])
});

export const StatePatchSchema = z.object({
  flagsAdd: z.array(z.string()).optional(),
  flagsRemove: z.array(z.string()).optional(),
  // Targeted detailed-character patches (keyed by characterId)
  characterMood: z.array(z.object({
    characterId: z.string(),
    mood: z.string(),
  })).optional(),
  characterSectionUpdate: z.array(z.object({
    characterId: z.string(),
    section: z.string(),
    content: z.string(),
  })).optional(),
  characterSectionItemAdd: z.array(z.object({
    characterId: z.string(),
    section: z.string(),
    item: z.string(),
  })).optional(),
  characterSectionItemRemove: z.array(z.object({
    characterId: z.string(),
    section: z.string(),
    item: z.string(),
  })).optional(),
  characterSectionItemReplace: z.array(z.object({
    characterId: z.string(),
    section: z.string(),
    from: z.string(),
    to: z.string(),
  })).optional(),
  characterSectionRemove: z.array(z.object({
    characterId: z.string(),
    section: z.string(),
  })).optional(),
  characterSectionRename: z.array(z.object({
    characterId: z.string(),
    from: z.string(),
    to: z.string(),
  })).optional(),
  characterTowardPlayer: z.array(z.object({
    characterId: z.string(),
    towardPlayer: z.string(),
  })).optional(),
  characterMemory: z.array(z.object({
    characterId: z.string(),
    memorySummary: z.string(),
  })).optional(),
  characterConditionsAdd: z.array(z.object({
    characterId: z.string(),
    conditions: z.array(z.string()),
  })).optional(),
  characterConditionsRemove: z.array(z.object({
    characterId: z.string(),
    conditions: z.array(z.string()),
  })).optional(),
  characterFlagsAdd: z.array(z.object({
    characterId: z.string(),
    flags: z.array(z.string()),
  })).optional(),
  characterFlagsRemove: z.array(z.object({
    characterId: z.string(),
    flags: z.array(z.string()),
  })).optional(),
  // Simple NPC (background cast) patches
  npcAdd: z.array(z.object({
    name: z.string(),
    description: z.string(),
    disposition: z.string().optional(),
    locationId: z.string().optional()
  })).optional(),
  npcRemove: z.array(z.string()).optional(),
  npcPromote: z.object({
      npcId: z.string(),
      content: z.string().optional(),
      memorySummary: z.string().optional(),
    }).optional(),
  locationAdd: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().default(""),
    state: z.string().default(""),
    icon: z.string().default("📍"),
    connections: z.array(z.string()).default([]),
  })).optional(),
  locationUpdate: z.array(z.object({
    locationId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    state: z.string().optional(),
    icon: z.string().optional(),
  })).optional(),
  locationConnect: z.array(z.object({
    locationId: z.string(),
    targetId: z.string(),
  })).optional(),
  locationDisconnect: z.array(z.object({
    locationId: z.string(),
    targetId: z.string(),
  })).optional(),
  characterLocation: z.array(z.object({
    characterId: z.string(),
    locationId: z.string(),
  })).optional(),
  inventoryAdd: z.array(InventoryPatchSchema).optional(),
  inventoryRemove: z.array(InventoryPatchSchema).optional(),
  itemAdd: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
    quantity: z.number().int().min(1).default(1),
    stackable: z.boolean().optional(),
  })).optional(),
  itemUpdate: z.array(z.object({
    itemId: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  questAdd: z.array(z.object({
    name: z.string(),
    summary: z.string()
  })).optional(),
  questUpdate: z.array(z.object({
    questId: z.string(),
    name: z.string().optional(),
    summary: z.string().optional(),
    status: z.enum(["active", "completed", "failed"]).optional()
  })).optional(),
  memoryEvents: z.array(MemoryEventDraftSchema).optional(),
  locationId: z.string().optional(),
  // Optional ordered route for player travel: current -> via[0] -> ... -> locationId.
  // Every consecutive hop must be a real connection; the engine validates the route.
  travelVia: z.array(z.string()).optional(),
  // Player-specific patches
  playerConditionsAdd: z.array(z.string()).optional(),
  playerConditionsRemove: z.array(z.string()).optional(),
  playerClothingAdd: z.array(ClothingItemSchema).optional(),
  playerClothingRemove: z.array(z.object({ slot: z.string() })).optional(),
  playerClothingSetState: z.array(z.object({ slot: z.string(), state: z.string() })).optional(),
  characterClothingAdd: z.array(z.object({
    characterId: z.string(),
    items: z.array(ClothingItemSchema),
  })).optional(),
  characterClothingRemove: z.array(z.object({
    characterId: z.string(),
    slots: z.array(z.string()),
  })).optional(),
  characterClothingSetState: z.array(z.object({
    characterId: z.string(),
    items: z.array(z.object({ slot: z.string(), state: z.string() })),
  })).optional(),
  characterClothingSet: z.array(z.object({
    characterId: z.string(),
    items: z.array(ClothingItemSchema),
  })).optional(),
  playerFlagsAdd: z.array(z.string()).optional(),
  playerFlagsRemove: z.array(z.string()).optional()
});
export type StatePatch = z.infer<typeof StatePatchSchema>;

export const AssistantTurnSchema = z.object({
  narrative: z.string(),
  choices: z.array(z.string()).optional(),
  statePatch: StatePatchSchema.optional()
});
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;

export const ScenarioPreferencesSchema = z.object({
  name: z.string().min(1).default("New Adventure"),
  setting: z.string().optional(),
  cast: z.array(z.object({
    name: z.string(),
    summary: z.string().optional(),
  })).optional(),
});
export type ScenarioPreferences = z.infer<typeof ScenarioPreferencesSchema>;

export const ScenarioSeedLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  state: z.string().default(""),
  icon: z.string().default("📍"),
  connections: z.array(z.string()).default([]),
});

export const ScenarioSeedCharacterSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const ScenarioSeedQuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string()
});

export const ScenarioSeedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  quantity: z.number().int().min(1).default(1)
});

export const ScenarioSeedSchema = z.object({
  locations: z.array(ScenarioSeedLocationSchema).min(1).max(5),
  character: ScenarioSeedCharacterSchema,
  quest: ScenarioSeedQuestSchema,
  items: z.array(ScenarioSeedItemSchema),
  startingFlags: z.array(z.string()).default([]),
  npcs: z.array(z.object({
    name: z.string(),
    description: z.string(),
    disposition: z.string().optional()
  })).default([]),
  openingText: z.string().optional()
});
export type ScenarioSeed = z.infer<typeof ScenarioSeedSchema>;
