import {
  CharacterFormat,
  CharacterInstance,
  CharacterTemplate,
  InventoryRef,
  Item,
  Playthrough,
  StatePatchSchema
} from "../schemas";
import {
  addSectionItem,
  applySectionChanges,
  parseClothingFromContent,
  removeContentSection,
  removeSectionItem,
  renameContentSection,
  replaceSectionItem,
  splitContentSections
} from "./characterSections";
import { formatSections, resolveCharacterFormat } from "./characterFormat";
import { ITEMS } from "./demoData";

/** The active prompt config's section order + inline set, threaded into section
 *  patches so new sections land where the user's format expects them. Falls back
 *  to the shipped Default format when no config is supplied. */
function formatPatchOpts(characterFormat?: CharacterFormat): { order: string[]; inlineHeaders: string[] } {
  const sections = formatSections(characterFormat);
  return {
    order: sections.map((s) => s.name),
    inlineHeaders: sections.filter((s) => s.inline).map((s) => s.name),
  };
}

function newId(prefix: string): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

/** CCv2 sheets are read-only in play (D9): no section or clothing patches. */
function isReadOnlySheet(next: Playthrough, character: CharacterInstance): boolean {
  if (!character.templateId) return false;
  return next.characterTemplates.find((t) => t.id === character.templateId)?.format === "ccv2";
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export type ApplyPatchResult = {
  state: Playthrough;
  applied: string[];
  rejected: string[];
  warnings: string[];
};

export function normalizeTag(str: string): string {
  return str
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, "")
    .replace(/[_\W]+/g, " ")
    .trim()
    .toLowerCase();
}

export function findMatchingTagIndex(list: string[], target: string): number {
  if (!target || list.length === 0) return -1;

  // 1. Exact match
  const exact = list.indexOf(target);
  if (exact >= 0) return exact;

  // 2. Case-insensitive trimmed match
  const targetTrim = target.trim().toLowerCase();
  const caseIdx = list.findIndex((item) => item.trim().toLowerCase() === targetTrim);
  if (caseIdx >= 0) return caseIdx;

  // 3. Normalized match (stripping emojis, punctuation, snake_case underscores to spaces)
  const targetNorm = normalizeTag(target);
  if (targetNorm.length > 0) {
    const normIdx = list.findIndex((item) => normalizeTag(item) === targetNorm);
    if (normIdx >= 0) return normIdx;

    // 4. Substring / inclusion match for specific terms (>= 3 chars)
    if (targetNorm.length >= 3) {
      const subIdx = list.findIndex((item) => {
        const itemNorm = normalizeTag(item);
        if (!itemNorm) return false;
        return itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm);
      });
      if (subIdx >= 0) return subIdx;
    }
  }

  return -1;
}

function addInventory(inventory: InventoryRef[], itemId: string, quantity: number): InventoryRef[] {
  const existing = inventory.find((item) => item.itemId === itemId);
  if (!existing) return [...inventory, { itemId, quantity }];
  return inventory.map((item) => (item.itemId === itemId ? { ...item, quantity: item.quantity + quantity } : item));
}

function buildFleshOutStubContent(name: string, description?: string, storyRole?: string): string {
  return [
    "[Species]: (unknown)",
    "[Gender]: (unknown)",
    "",
    "[Body]",
    "(no details recorded yet)",
    "",
    "[Appearance]",
    description ?? "(no details recorded yet)",
    "",
    "[Personality]",
    storyRole ? `- ${storyRole}` : "- (not yet established)",
    "",
    "[Communication - Public]",
    "(not yet established)",
    "",
    "[Communication - Private]",
    "(not yet established)",
    "",
    "[Likes]",
    "(not established)",
    "",
    "[Dislikes]",
    "(not established)",
  ].join("\n");
}

export function applyStatePatch(state: Playthrough, patchInput: unknown, characterFormat?: CharacterFormat): ApplyPatchResult {
  const parsed = StatePatchSchema.safeParse(patchInput);
  const next = clone(state);
  const applied: string[] = [];
  const rejected: string[] = [];
  const warnings: string[] = [];

  if (!parsed.success) {
    return { state, applied, rejected: ["statePatch failed schema validation"], warnings };
  }

  const patch = parsed.data;

  for (const entry of patch.worldStateAdd ?? []) {
    next.worldState.push({
      id: newId("ws"),
      name: entry.name,
      description: entry.description
    });
    applied.push("world state added: " + entry.name);
  }

  for (const nameOrId of patch.worldStateRemove ?? []) {
    const originalLength = next.worldState.length;
    next.worldState = next.worldState.filter((ws) => ws.id !== nameOrId && ws.name !== nameOrId);
    if (next.worldState.length < originalLength) {
      applied.push(`world state removed: ${nameOrId}`);
    }
  }

  for (const update of patch.worldStateUpdate ?? []) {
    const entry = next.worldState.find((ws) => ws.id === update.id || ws.name.toLowerCase() === update.id.toLowerCase());
    if (!entry) {
      rejected.push("unknown world state: " + update.id);
      continue;
    }
    if (update.name !== undefined) entry.name = update.name;
    if (update.description !== undefined) entry.description = update.description;
    applied.push("world state updated: " + (update.name ?? entry.name));
  }

  const itemCatalog: Item[] = next.itemCatalog ?? ITEMS;

  for (const itemPatch of patch.inventoryAdd ?? []) {
    if (!itemCatalog.some((item) => item.id === itemPatch.itemId)) {
      rejected.push(`unknown item: ${itemPatch.itemId}`);
      continue;
    }
    next.inventory = addInventory(next.inventory, itemPatch.itemId, itemPatch.quantity);
    applied.push(`inventory added: ${itemPatch.itemId} x${itemPatch.quantity}`);
  }

  for (const itemPatch of patch.inventoryRemove ?? []) {
    const existing = next.inventory.find((item) => item.itemId === itemPatch.itemId);
    if (!existing) {
      rejected.push(`cannot remove missing item: ${itemPatch.itemId}`);
      continue;
    }

    const remaining = existing.quantity - itemPatch.quantity;
    next.inventory = remaining > 0
      ? next.inventory.map((item) => (item.itemId === itemPatch.itemId ? { ...item, quantity: remaining } : item))
      : next.inventory.filter((item) => item.itemId !== itemPatch.itemId);
    applied.push(`inventory removed: ${itemPatch.itemId} x${itemPatch.quantity}`);
  }

  for (const itemDef of patch.itemAdd ?? []) {
    const catalog = next.itemCatalog ?? [];
    if (catalog.some((i) => i.id === itemDef.id)) {
      rejected.push("item already exists: " + itemDef.id);
      continue;
    }
    const newItem: Item = {
      id: itemDef.id,
      name: itemDef.name,
      type: itemDef.type,
      description: itemDef.description,
      stackable: itemDef.stackable ?? (itemDef.type === "consumable" || itemDef.type === "misc" || itemDef.quantity > 1),
    };
    catalog.push(newItem);
    next.itemCatalog = catalog;
    next.inventory = addInventory(next.inventory, newItem.id, itemDef.quantity);
    applied.push("item introduced: " + itemDef.name + " x" + itemDef.quantity + " (" + itemDef.id + ")");
  }

  for (const update of patch.itemUpdate ?? []) {
    const catalog = next.itemCatalog ?? [];
    const item = catalog.find((i) => i.id === update.itemId);
    if (!item) {
      rejected.push("unknown item: " + update.itemId);
      continue;
    }
    if (update.name !== undefined) item.name = update.name;
    if (update.type !== undefined) item.type = update.type;
    if (update.description !== undefined) item.description = update.description;
    next.itemCatalog = catalog;
    applied.push("item updated: " + (update.name ?? item.name) + " (" + update.itemId + ")");
  }



  function findCharacter(ref: string): CharacterInstance | undefined {
    return next.characters.find(
      (c) => c.id === ref || c.name.toLowerCase() === ref.toLowerCase()
    );
  }

  for (const entry of patch.characterMood ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for mood: " + entry.characterId); continue; }
    character.mood = entry.mood;
    applied.push("mood set: " + character.name + " → " + entry.mood);
  }

  for (const entry of patch.characterTowardPlayer ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for towardPlayer: " + entry.characterId); continue; }
    character.towardPlayer = entry.towardPlayer;
    applied.push("towardPlayer set: " + character.name + " → " + entry.towardPlayer);
  }

  for (const entry of patch.characterSectionUpdate ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) {
      rejected.push("unknown character for sectionUpdate: " + entry.characterId);
      continue;
    }
    if (isReadOnlySheet(next, character)) {
      rejected.push("section update rejected: " + character.name + " has a read-only CCv2 sheet");
      continue;
    }
    const tplIdx = next.characterTemplates.findIndex(
      (t) => t.id === character.templateId
    );
    if (tplIdx < 0) {
      rejected.push("no template found for character: " + character.name);
      continue;
    }
    // Any header is allowed — the format (or the sheet itself) defines the set.
    if (entry.section.trim().toLowerCase() === "clothing") {
      character.clothing = parseClothingFromContent(entry.content);
      applied.push(
        "clothing updated: " + character.name + " (via section redirect)"
      );
      continue;
    }
    const fmt = formatPatchOpts(characterFormat);
    const r = applySectionChanges(
      next.characterTemplates[tplIdx].content,
      [{ header: entry.section, body: entry.content }],
      { order: fmt.order, inlineHeaders: fmt.inlineHeaders }
    );
    next.characterTemplates[tplIdx] = {
      ...next.characterTemplates[tplIdx],
      content: r,
    };
    applied.push(
      "section updated: " + character.name + " → [" + entry.section + "]"
    );
  }

  for (const entry of patch.characterSectionRemove ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) {
      rejected.push("unknown character for sectionRemove: " + entry.characterId);
      continue;
    }
    if (isReadOnlySheet(next, character)) {
      rejected.push("section remove rejected: " + character.name + " has a read-only CCv2 sheet");
      continue;
    }
    const tplIdx = next.characterTemplates.findIndex((t) => t.id === character.templateId);
    if (tplIdx < 0) { rejected.push("no template found for character: " + character.name); continue; }
    const before = next.characterTemplates[tplIdx].content;
    const beforeCount = splitContentSections(before).sections.length;
    const after = removeContentSection(before, entry.section);
    const afterCount = splitContentSections(after).sections.length;
    if (afterCount === beforeCount) {
      rejected.push("section remove failed: " + character.name + " has no [" + entry.section + "] section");
      continue;
    }
    next.characterTemplates[tplIdx] = { ...next.characterTemplates[tplIdx], content: after };
    if (entry.section.trim().toLowerCase() === "clothing") {
      character.clothing = [];
    }
    applied.push("section removed: " + character.name + " → [" + entry.section + "]");
  }

  for (const entry of patch.characterSectionRename ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) {
      rejected.push("unknown character for sectionRename: " + entry.characterId);
      continue;
    }
    if (isReadOnlySheet(next, character)) {
      rejected.push("section rename rejected: " + character.name + " has a read-only CCv2 sheet");
      continue;
    }
    const tplIdx = next.characterTemplates.findIndex((t) => t.id === character.templateId);
    if (tplIdx < 0) { rejected.push("no template found for character: " + character.name); continue; }
    const fromKey = entry.from.trim().toLowerCase();
    const toKey = entry.to.trim().toLowerCase();
    if (!fromKey || !toKey || fromKey === toKey) {
      rejected.push("section rename failed: " + character.name + " — from and to must differ");
      continue;
    }
    const before = next.characterTemplates[tplIdx].content;
    const exists = splitContentSections(before).sections.some((s) => s.header.trim().toLowerCase() === fromKey);
    if (!exists) {
      rejected.push("section rename failed: " + character.name + " has no [" + entry.from + "] section");
      continue;
    }
    const after = renameContentSection(before, entry.from, entry.to);
    next.characterTemplates[tplIdx] = { ...next.characterTemplates[tplIdx], content: after };
    // Keep the structured-clothing invariant: renaming a [Clothing] section
    // means the outfit is no longer described as clothing (clear it), and
    // renaming a section TO "Clothing" re-derives the outfit from it.
    if (fromKey === "clothing") {
      character.clothing = [];
    } else if (toKey === "clothing") {
      character.clothing = parseClothingFromContent(after);
    }
    applied.push("section renamed: " + character.name + " → [" + entry.from + "] ⇒ [" + entry.to + "]");
  }

  for (const entry of patch.characterSectionItemAdd ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for sectionItemAdd: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("section item add rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    if (entry.section.trim().toLowerCase() === "clothing") { rejected.push("section item add rejected: use characterClothing* patches for Clothing"); continue; }
    if (!next.activeCharacters.includes(character.id)) { rejected.push("section item add rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
    const tplIdx = next.characterTemplates.findIndex((t) => t.id === character.templateId);
    if (tplIdx < 0) { rejected.push("no template found for character: " + character.name); continue; }
    const r = addSectionItem(next.characterTemplates[tplIdx].content, entry.section, entry.item);
    if (!r.applied) { rejected.push("section item add failed: " + (r.rejectedReason ?? "unknown")); continue; }
    next.characterTemplates[tplIdx] = { ...next.characterTemplates[tplIdx], content: r.content };
    applied.push("section item added: " + character.name + " → [" + entry.section + "] " + entry.item);
  }

  for (const entry of patch.characterSectionItemRemove ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for sectionItemRemove: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("section item remove rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    if (entry.section.trim().toLowerCase() === "clothing") { rejected.push("section item remove rejected: use characterClothing* patches for Clothing"); continue; }
    if (!next.activeCharacters.includes(character.id)) { rejected.push("section item remove rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
    const tplIdx = next.characterTemplates.findIndex((t) => t.id === character.templateId);
    if (tplIdx < 0) { rejected.push("no template found for character: " + character.name); continue; }
    const r = removeSectionItem(next.characterTemplates[tplIdx].content, entry.section, entry.item);
    if (!r.applied) { rejected.push("section item remove failed: " + (r.rejectedReason ?? "unknown")); continue; }
    next.characterTemplates[tplIdx] = { ...next.characterTemplates[tplIdx], content: r.content };
    applied.push("section item removed: " + character.name + " → [" + entry.section + "] " + entry.item);
  }

  for (const entry of patch.characterSectionItemReplace ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for sectionItemReplace: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("section item replace rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    if (entry.section.trim().toLowerCase() === "clothing") { rejected.push("section item replace rejected: use characterClothing* patches for Clothing"); continue; }
    if (!next.activeCharacters.includes(character.id)) { rejected.push("section item replace rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
    const tplIdx = next.characterTemplates.findIndex((t) => t.id === character.templateId);
    if (tplIdx < 0) { rejected.push("no template found for character: " + character.name); continue; }
    const r = replaceSectionItem(next.characterTemplates[tplIdx].content, entry.section, entry.from, entry.to);
    if (!r.applied) { rejected.push("section item replace failed: " + (r.rejectedReason ?? "unknown")); continue; }
    next.characterTemplates[tplIdx] = { ...next.characterTemplates[tplIdx], content: r.content };
    applied.push("section item replaced: " + character.name + " → [" + entry.section + "] " + entry.from + " ⇒ " + entry.to);
  }

  for (const entry of patch.characterConditionsAdd ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for conditions: " + entry.characterId); continue; }
    for (const cond of entry.conditions) {
      if (!character.conditions.includes(cond)) {
        character.conditions.push(cond);
        applied.push("condition added: " + character.name + " → " + cond);
      }
    }
  }

  for (const entry of patch.characterConditionsRemove ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for conditions: " + entry.characterId); continue; }
    for (const cond of entry.conditions) {
      const idx = findMatchingTagIndex(character.conditions, cond);
      if (idx >= 0) {
        const removed = character.conditions.splice(idx, 1)[0];
        applied.push("condition removed: " + character.name + " → " + removed);
      }
    }
  }

  const charCondReplaces = [
    ...(patch.characterConditionsReplace ?? []),
    ...(patch.characterConditionsUpdate ?? []),
  ];
  for (const entry of charCondReplaces) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for conditions replace: " + entry.characterId); continue; }
    const idx = findMatchingTagIndex(character.conditions, entry.from);
    if (idx >= 0) {
      const old = character.conditions[idx];
      character.conditions[idx] = entry.to;
      applied.push("condition replaced: " + character.name + " → " + old + " ⇒ " + entry.to);
    } else {
      if (!character.conditions.includes(entry.to)) {
        character.conditions.push(entry.to);
        applied.push("condition added (replace fallback): " + character.name + " → " + entry.to);
      }
    }
  }

  for (const entry of patch.characterFlagsAdd ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for flags: " + entry.characterId); continue; }
    for (const flag of entry.flags) {
      if (!character.flags.includes(flag)) {
        character.flags.push(flag);
        applied.push("character flag added: " + character.name + " → " + flag);
      }
    }
  }

  for (const entry of patch.characterFlagsRemove ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for flags: " + entry.characterId); continue; }
    for (const flag of entry.flags) {
      const idx = findMatchingTagIndex(character.flags, flag);
      if (idx >= 0) {
        const removed = character.flags.splice(idx, 1)[0];
        applied.push("character flag removed: " + character.name + " → " + removed);
      }
    }
  }

  for (const entry of patch.characterMemory ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for memory: " + entry.characterId); continue; }
    character.memorySummary = entry.memorySummary;
    applied.push("memory updated: " + character.name);
  }

  for (const entry of patch.characterClothingAdd ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for clothing add: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("clothing patch rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    for (const item of entry.items) {
      if (!character.clothing.some((c) => c.slot.toLowerCase() === item.slot.toLowerCase())) {
        character.clothing.push(clone(item));
        applied.push("clothing added: " + character.name + " → " + item.slot + ": " + item.name);
      }
    }
  }

  for (const entry of patch.characterClothingRemove ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for clothing remove: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("clothing patch rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    for (const slot of entry.slots) {
      const idx = character.clothing.findIndex((c) => c.slot.toLowerCase() === slot.toLowerCase());
      if (idx >= 0) {
        character.clothing.splice(idx, 1);
        applied.push("clothing removed: " + character.name + " → " + slot);
      } else {
        rejected.push("clothing slot not found for " + character.name + ": " + slot);
      }
    }
  }

  for (const entry of patch.characterClothingSetState ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for clothing state: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("clothing patch rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    for (const item of entry.items) {
      const worn = character.clothing.find((c) => c.slot.toLowerCase() === item.slot.toLowerCase());
      if (worn) {
        worn.state = item.state;
        applied.push("clothing state set: " + character.name + " → " + item.slot + " (" + item.state + ")");
      } else {
        rejected.push("clothing slot not found for " + character.name + ": " + item.slot);
      }
    }
  }

  for (const entry of patch.characterClothingSet ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) { rejected.push("unknown character for clothing set: " + entry.characterId); continue; }
    if (isReadOnlySheet(next, character)) { rejected.push("clothing patch rejected: " + character.name + " has a read-only CCv2 sheet"); continue; }
    character.clothing = clone(entry.items);
    applied.push("outfit replaced: " + character.name);
  }

  for (const ref of patch.characterEnterScene ?? []) {
    const character = findCharacter(ref);
    if (!character) {
      rejected.push(`unknown character to enter scene: ${ref}`);
      continue;
    }
    if (!next.activeCharacters.includes(character.id)) {
      next.activeCharacters.push(character.id);
      applied.push(`character entered scene: ${character.name}`);
    }
  }

  for (const ref of patch.characterExitScene ?? []) {
    const character = findCharacter(ref);
    if (!character) {
      rejected.push(`unknown character to exit scene: ${ref}`);
      continue;
    }
    if (next.activeCharacters.includes(character.id)) {
      next.activeCharacters = next.activeCharacters.filter((id) => id !== character.id);
      applied.push(`character exited scene: ${character.name}`);
    }
  }

  for (const entry of patch.characterUpdateRole ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) {
      rejected.push(`unknown character for role update: ${entry.characterId}`);
      continue;
    }
    character.storyRole = entry.storyRole;
    character.updatedAt = nowIso();
    applied.push(`role updated: ${character.name} → ${entry.storyRole}`);
  }

  for (const simple of patch.characterAddSimple ?? []) {
    const charId = newId("inst");
    const newChar: CharacterInstance = {
      id: charId,
      playthroughId: next.id,
      branchId: next.branchId,
      name: simple.name,
      description: simple.description,
      storyRole: simple.storyRole,
      mood: "neutral",
      towardPlayer: "neutral",
      memorySummary: `${simple.name} has not formed a strong opinion of the player yet.`,
      conditions: [],
      flags: [],
      clothing: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    next.characters.push(newChar);
    if (!next.activeCharacters.includes(charId)) {
      next.activeCharacters.push(charId);
    }
    applied.push(`simple character added: ${simple.name} (${simple.storyRole})`);
  }

  if (patch.characterFleshOut) {
    const { characterId, content, memorySummary } = patch.characterFleshOut;
    const character = findCharacter(characterId);
    if (!character) {
      rejected.push(`unknown character to flesh out: ${characterId}`);
    } else if (character.templateId) {
      rejected.push(`character already detailed: ${character.name}`);
    } else {
      const templateId = `tmpl_fleshed_${character.id}`;
      const templateContent = content ?? buildFleshOutStubContent(character.name, character.description, character.storyRole);
      const template: CharacterTemplate = {
        id: templateId,
        name: character.name,
        version: 1,
        content: templateContent,
        summary: "",
        startingClothing: [],
      };
      character.templateId = templateId;
      if (memorySummary) {
        character.memorySummary = memorySummary;
      }
      if (!character.clothing || character.clothing.length === 0) {
        character.clothing = parseClothingFromContent(templateContent);
      }
      character.updatedAt = nowIso();
      next.characterTemplates.push(template);
      applied.push(`character fleshed out: ${character.name}`);
    }
  }

  for (const item of patch.playerClothingAdd ?? []) {
    next.playerCharacter.clothing = [
      ...next.playerCharacter.clothing.filter((c) => c.slot !== item.slot),
      item
    ];
    applied.push(`player clothing added: ${item.slot} — ${item.name}`);
  }
  for (const remove of patch.playerClothingRemove ?? []) {
    const before = next.playerCharacter.clothing.length;
    next.playerCharacter.clothing = next.playerCharacter.clothing.filter((c) => c.slot !== remove.slot);
    if (next.playerCharacter.clothing.length < before) {
      applied.push(`player clothing removed: ${remove.slot}`);
    }
  }
  for (const setState of patch.playerClothingSetState ?? []) {
    const item = next.playerCharacter.clothing.find((c) => c.slot === setState.slot);
    if (item) {
      item.state = setState.state;
      applied.push(`player clothing state: ${setState.slot} → ${setState.state}`);
    } else {
      rejected.push(`cannot set state on missing clothing slot: ${setState.slot}`);
    }
  }

  for (const condition of patch.playerConditionsAdd ?? []) {
    if (!next.playerCharacter.conditions.includes(condition)) {
      next.playerCharacter.conditions.push(condition);
      applied.push(`player condition added: ${condition}`);
    }
  }
  for (const condition of patch.playerConditionsRemove ?? []) {
    const idx = findMatchingTagIndex(next.playerCharacter.conditions, condition);
    if (idx >= 0) {
      const removed = next.playerCharacter.conditions.splice(idx, 1)[0];
      applied.push(`player condition removed: ${removed}`);
    }
  }

  const playerCondReplaces = [
    ...(patch.playerConditionsReplace ?? []),
    ...(patch.playerConditionsUpdate ?? []),
  ];
  for (const entry of playerCondReplaces) {
    const idx = findMatchingTagIndex(next.playerCharacter.conditions, entry.from);
    if (idx >= 0) {
      const old = next.playerCharacter.conditions[idx];
      next.playerCharacter.conditions[idx] = entry.to;
      applied.push(`player condition replaced: ${old} ⇒ ${entry.to}`);
    } else {
      if (!next.playerCharacter.conditions.includes(entry.to)) {
        next.playerCharacter.conditions.push(entry.to);
        applied.push(`player condition added (replace fallback): ${entry.to}`);
      }
    }
  }

  for (const flag of patch.playerFlagsAdd ?? []) {
    if (!next.playerCharacter.flags.includes(flag)) {
      next.playerCharacter.flags.push(flag);
      applied.push(`player flag added: ${flag}`);
    }
  }
  for (const flag of patch.playerFlagsRemove ?? []) {
    const idx = findMatchingTagIndex(next.playerCharacter.flags, flag);
    if (idx >= 0) {
      const removed = next.playerCharacter.flags.splice(idx, 1)[0];
      applied.push(`player flag removed: ${removed}`);
    }
  }

  for (const memoryDraft of patch.memoryEvents ?? []) {
    next.memoryEvents.push({
      id: newId("mem"),
      playthroughId: next.id,
      branchId: next.branchId,
      characterInstanceId: memoryDraft.characterInstanceId,
      turn: next.turn,
      type: memoryDraft.type,
      summary: memoryDraft.summary,
      importance: memoryDraft.importance,
      tags: memoryDraft.tags,
      createdAt: nowIso()
    });
    applied.push(`memory event added: ${memoryDraft.summary}`);
  }

  next.updatedAt = nowIso();
  return { state: next, applied, rejected, warnings };
}
