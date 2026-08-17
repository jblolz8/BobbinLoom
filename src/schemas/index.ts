import { z } from "zod";

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

export const ProviderConnectionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  contextWindow: z.number(),
  readonly: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;

export const ProviderRegistryFileSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  activeProviderId: z.string(),
  connections: z.array(ProviderConnectionSchema)
});
export type ProviderRegistryFile = z.infer<typeof ProviderRegistryFileSchema>;

export const CustomCategoryConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  prefixes: z.array(z.string()).default([]),
  color: z.string(),
  description: z.string().optional(),
});
export type CustomCategoryConfig = z.infer<typeof CustomCategoryConfigSchema>;

export const TagTaxonomyConfigSchema = z.object({
  customCategories: z.array(CustomCategoryConfigSchema).default([]),
  tagOverrides: z.record(z.string()).default({}),
});
export type TagTaxonomyConfig = z.infer<typeof TagTaxonomyConfigSchema>;

export const AvatarShapeSchema = z.enum(["square", "rounded", "circle"]);
export type AvatarShape = z.infer<typeof AvatarShapeSchema>;

export const AppSettingsSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  defaultPresetId: z.string().optional(),
  tagTaxonomy: TagTaxonomyConfigSchema.optional(),
  avatarShape: AvatarShapeSchema.optional(),
  updatedAt: z.string().optional()
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

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

export const MODULE_CONTEXTS = ["turn", "seed", "sheet", "summary"] as const;
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
    if (Array.isArray(val)) return { turn: val, seed: [], sheet: [], summary: [] };
    if (typeof val === "object" && val !== null) {
      return { turn: [], seed: [], sheet: [], summary: [], ...(val as Record<string, unknown>) };
    }
    return val;
  },
  z.object({
    turn: z.array(PromptPresetModuleSchema),
    seed: z.array(PromptPresetModuleSchema),
    sheet: z.array(PromptPresetModuleSchema),
    summary: z.array(PromptPresetModuleSchema)
  })
);
export type PromptModuleSet = z.infer<typeof PromptModuleSetSchema>;
export const EMPTY_MODULE_SET: PromptModuleSet = { turn: [], seed: [], sheet: [], summary: [] };

export const PromptPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  readonly: z.boolean(),
  modules: PromptModuleSetSchema
});
export type PromptPreset = z.infer<typeof PromptPresetSchema>;

export const PlaythroughPromptSettingsSchema = z.object({
  presetId: z.string(),
  presetName: z.string(),
  modules: PromptModuleSetSchema
});
export type PlaythroughPromptSettings = z.infer<typeof PlaythroughPromptSettingsSchema>;


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

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().optional(),
  hidden: z.boolean().optional(),
  chapterId: z.string().optional(),
  /** Marks the assistant message that opens a new chapter after the previous
   *  chapter was archived. Drives the "Re-summarize previous chapter" action. */
  chapterOpening: z.boolean().optional()
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
  createdAt: z.string()
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
  memoryEvents: z.array(MemoryEventSchema),
  memoryLayers: MemoryLayersSchema.optional(),
  lorebookIds: z.array(z.string()),
  locationCatalog: z.array(LocationEntrySchema).optional(),
  chapters: z.array(ChapterSchema).default([]),
  storyMetaSummaries: z.array(ChapterMetaSummarySchema).default([]),
  currentChapterStartedAtTurn: z.number().default(1),
});
export type TurnSnapshot = z.infer<typeof TurnSnapshotSchema>;

export const PlaythroughSchema = z.object({
  schemaVersion: z.number().int().min(1).default(1),
  id: z.string(),
  name: z.string(),
  branchId: z.string(),
  parentBranchId: z.string().optional(),
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
  promptSettings: PlaythroughPromptSettingsSchema.optional(),
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

export const PlaythroughListResponseSchema = z.object({
  playthroughs: z.array(PlaythroughSchema),
  failures: z.array(LoadFailureSchema),
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
