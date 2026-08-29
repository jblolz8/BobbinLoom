import {
  CharacterInstance,
  CharacterTemplate,
  InventoryRef,
  Item,
  LocationEntry,
  Playthrough,
  SimpleNPC,
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
import { ITEMS, LOCATIONS } from "./demoData";
import { instantiateTemplate } from "./playthroughFactory";

/** The active preset's section order + inline set, threaded into section
 *  patches so new sections land where the user's format expects them. */
function formatPatchOpts(next: Playthrough): { order: string[]; inlineHeaders: string[] } {
  const sections = formatSections(next.promptSettings?.characterFormat);
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

function addInventory(inventory: InventoryRef[], itemId: string, quantity: number): InventoryRef[] {
  const existing = inventory.find((item) => item.itemId === itemId);
  if (!existing) return [...inventory, { itemId, quantity }];
  return inventory.map((item) => (item.itemId === itemId ? { ...item, quantity: item.quantity + quantity } : item));
}

function buildPromotionStubContent(npc: SimpleNPC): string {
  const disposition = npc.disposition ?? "";
  return [
    "[Species]: (unknown)",
    "[Gender]: (unknown)",
    "",
    "[Body]",
    "(no details recorded yet)",
    "",
    "[Appearance]",
    npc.description,
    "",
    "[Personality]",
    disposition ? `- ${disposition}` : "- (not yet established)",
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

export function applyStatePatch(state: Playthrough, patchInput: unknown): ApplyPatchResult {
  const parsed = StatePatchSchema.safeParse(patchInput);
  const next = clone(state);
  const applied: string[] = [];
  const rejected: string[] = [];
  const warnings: string[] = [];

  if (!parsed.success) {
    return { state, applied, rejected: ["statePatch failed schema validation"], warnings };
  }

  const patch = parsed.data;

  for (const flag of patch.flagsAdd ?? []) {
    if (!next.flags.includes(flag)) {
      next.flags.push(flag);
      applied.push(`flag added: ${flag}`);
    }
  }

  for (const flag of patch.flagsRemove ?? []) {
    if (next.flags.includes(flag)) {
      next.flags = next.flags.filter((existing) => existing !== flag);
      applied.push(`flag removed: ${flag}`);
    }
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

  for (const q of patch.questAdd ?? []) {
    next.quests.push({
      id: newId("quest"),
      name: q.name,
      summary: q.summary,
      tracking: false,
      status: "active"
    });
    applied.push("quest added: " + q.name);
  }

  for (const u of patch.questUpdate ?? []) {
    const quest = next.quests.find((q) => q.id === u.questId);
    if (!quest) {
      rejected.push("unknown quest: " + u.questId);
      continue;
    }
    if (u.name !== undefined) quest.name = u.name;
    if (u.summary !== undefined) quest.summary = u.summary;
    if (u.status !== undefined) quest.status = u.status;
    applied.push("quest updated: " + quest.name + " -> " + (u.status ?? "(fields only)"));
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
    const fmt = formatPatchOpts(next);
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
    if (character.currentLocationId !== next.locationId) { rejected.push("section item add rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
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
    if (character.currentLocationId !== next.locationId) { rejected.push("section item remove rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
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
    if (character.currentLocationId !== next.locationId) { rejected.push("section item replace rejected: " + character.name + " is not present (absent characters' sections aren't in context)"); continue; }
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
      const idx = character.conditions.indexOf(cond);
      if (idx >= 0) { character.conditions.splice(idx, 1); applied.push("condition removed: " + character.name + " → " + cond); }
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
      const idx = character.flags.indexOf(flag);
      if (idx >= 0) { character.flags.splice(idx, 1); applied.push("character flag removed: " + character.name + " → " + flag); }
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

  for (const npc of patch.npcAdd ?? []) {
    next.npcs.push({
      id: newId("npc"),
      name: npc.name,
      description: npc.description,
      disposition: npc.disposition,
      locationId: npc.locationId ?? next.locationId,
      createdAt: nowIso()
    });
    applied.push(`background NPC added: ${npc.name}`);
  }

  for (const npcRef of patch.npcRemove ?? []) {
    const before = next.npcs.length;
    next.npcs = next.npcs.filter((n) => n.id !== npcRef && n.name.toLowerCase() !== npcRef.toLowerCase());
    if (next.npcs.length < before) {
      applied.push(`background NPC removed: ${npcRef}`);
    } else {
      rejected.push(`unknown background NPC: ${npcRef}`);
    }
  }

  if (patch.npcPromote) {
    const { npcId, content } = patch.npcPromote;
    const npc = next.npcs.find((n) => n.id === npcId || n.name.toLowerCase() === npcId.toLowerCase());
    if (!npc) {
      rejected.push(`unknown background NPC to promote: ${npcId}`);
    } else {
      const template: CharacterTemplate = {
        id: `tmpl_promoted_${npc.id}`,
        name: npc.name,
        version: 1,
        content: content ?? buildPromotionStubContent(npc),
        summary: "",
        startingClothing: [],
      };
      const instance = instantiateTemplate(template, next.id, next.branchId, npc.locationId, patch.npcPromote.memorySummary);
      next.characterTemplates.push(template);
      next.characters.push(instance);
      next.npcs = next.npcs.filter((n) => n.id !== npc.id);
      applied.push(`background NPC promoted to main cast: ${npc.name}`);
    }
  }

  function isNameSimilar(a: string, b: string): boolean {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const na = norm(a), nb = norm(b);
    if (na === nb) return true;
    if (na.length > 3 && nb.length > 3 && (na.includes(nb) || nb.includes(na))) return true;
    return false;
  }

  function assignCoordinates(catalog: LocationEntry[], connections: string[]): { x: number; y: number } {
    const PARENT_OFFSET = 80;
    const JITTER = 40;

    for (const connRef of connections) {
      const parent = catalog.find(l => l.id === connRef || l.name.toLowerCase() === connRef.toLowerCase());
      if (parent) {
        return {
          x: parent.x + (Math.random() - 0.5) * 2 * JITTER,
          y: parent.y + PARENT_OFFSET + (Math.random() - 0.5) * 2 * JITTER,
        };
      }
    }

    return {
      x: (Math.random() - 0.5) * 2 * JITTER,
      y: (Math.random() - 0.5) * 2 * JITTER,
    };
  }

  for (const loc of patch.locationAdd ?? []) {
    const catalog = next.locationCatalog ?? [];

    const similar = catalog.find(l => isNameSimilar(l.name, loc.name));
    if (similar) {
      rejected.push(`similar location exists: "${similar.name}" (${similar.id}) — use locationId to move there instead`);
      continue;
    }

    if (catalog.some((l) => l.id === loc.id)) {
      rejected.push(`location already exists: ${loc.id}`);
      continue;
    }

    const coords = assignCoordinates(catalog, loc.connections);

    const resolvedConnections: string[] = [];
    for (const connRef of loc.connections) {
      const target = catalog.find(l => l.id === connRef || l.name.toLowerCase() === connRef.toLowerCase());
      if (target) {
        resolvedConnections.push(target.id);
        if (!target.connections.includes(loc.id)) {
          target.connections.push(loc.id);
        }
      } else {
        warnings.push(`location "${loc.name}" added but connection to "${connRef}" skipped: unknown location`);
      }
    }

    const entry: LocationEntry = {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      state: loc.state,
      icon: loc.icon,
      connections: resolvedConnections,
      x: coords.x,
      y: coords.y,
    };
    catalog.push(entry);
    next.locationCatalog = catalog;
    applied.push(`location added: ${loc.name} (${loc.id})`);
  }

  for (const update of patch.locationUpdate ?? []) {
    const catalog = next.locationCatalog ?? [];
    const loc = catalog.find(l => l.id === update.locationId || l.name.toLowerCase() === update.locationId.toLowerCase());
    if (!loc) {
      rejected.push(`unknown location for update: ${update.locationId}`);
      continue;
    }
    if (update.name !== undefined) loc.name = update.name;
    if (update.description !== undefined) loc.description = update.description;
    if (update.state !== undefined) loc.state = update.state;
    if (update.icon !== undefined) loc.icon = update.icon;
    next.locationCatalog = catalog;
    applied.push(`location updated: ${loc.name} (${loc.id})`);
  }

  for (const edge of patch.locationConnect ?? []) {
    const catalog = next.locationCatalog ?? [];
    const a = catalog.find(l => l.id === edge.locationId || l.name.toLowerCase() === edge.locationId.toLowerCase());
    const b = catalog.find(l => l.id === edge.targetId || l.name.toLowerCase() === edge.targetId.toLowerCase());
    if (!a) { rejected.push(`unknown location: ${edge.locationId}`); continue; }
    if (!b) { rejected.push(`unknown location: ${edge.targetId}`); continue; }
    if (a.id === b.id) { rejected.push(`cannot connect location to itself: ${a.id}`); continue; }
    if (!a.connections.includes(b.id)) {
      a.connections.push(b.id);
      applied.push(`connection added: ${a.name} → ${b.name}`);
    }
    if (!b.connections.includes(a.id)) {
      b.connections.push(a.id);
    }
    next.locationCatalog = catalog;
  }

  for (const edge of patch.locationDisconnect ?? []) {
    const catalog = next.locationCatalog ?? [];
    const a = catalog.find(l => l.id === edge.locationId || l.name.toLowerCase() === edge.locationId.toLowerCase());
    const b = catalog.find(l => l.id === edge.targetId || l.name.toLowerCase() === edge.targetId.toLowerCase());
    if (!a || !b) { rejected.push(`unknown location for disconnect: ${edge.locationId} / ${edge.targetId}`); continue; }
    a.connections = a.connections.filter(id => id !== b.id);
    b.connections = b.connections.filter(id => id !== a.id);
    next.locationCatalog = catalog;
    applied.push(`connection removed: ${a.name} ↔ ${b.name}`);
  }

  if (patch.locationId) {
    const catalog = next.locationCatalog ?? LOCATIONS;
    const resolveLoc = (ref: string) => catalog.find(
      (l) => l.id === ref || l.name.toLowerCase() === ref.toLowerCase()
    );
    const start = resolveLoc(next.locationId);
    const target = resolveLoc(patch.locationId);
    if (!target) {
      rejected.push(`unknown location: ${patch.locationId}`);
    } else {
      const viaRefs = patch.travelVia ?? [];
      const badViaIdx = viaRefs.findIndex((ref) => !resolveLoc(ref));
      if (badViaIdx >= 0) {
        rejected.push(`unknown location in travelVia: ${viaRefs[badViaIdx]}`);
      } else if (!start) {
        rejected.push(`cannot validate travel: current location ${next.locationId} not found`);
      } else {
        const route = [start, ...viaRefs.map(resolveLoc), target];
        let valid = true;
        for (let i = 0; i < route.length - 1; i++) {
          const a = route[i], b = route[i + 1];
          if (!a || !b) { valid = false; break; }
          if (a.id === b.id) {
            rejected.push(`travel route repeats location: ${a.id}`);
            valid = false;
            break;
          }
          if (!a.connections.includes(b.id)) {
            rejected.push(`no direct path: ${a.name} → ${b.name} are not connected`);
            valid = false;
            break;
          }
        }
        if (valid) {
          next.locationId = target.id;
          applied.push(`location changed: ${target.name} (${target.id})`);
        }
      }
    }
  }

  for (const entry of patch.characterLocation ?? []) {
    const character = findCharacter(entry.characterId);
    if (!character) {
      rejected.push(`unknown character for location: ${entry.characterId}`);
      continue;
    }
    const catalog = next.locationCatalog ?? [];
    const loc = catalog.find(l => l.id === entry.locationId || l.name.toLowerCase() === entry.locationId.toLowerCase());
    if (!loc) {
      rejected.push(`unknown location for character: ${entry.locationId}`);
      continue;
    }
    character.currentLocationId = loc.id;
    applied.push(`character moved: ${character.name} → ${loc.name}`);
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
    const idx = next.playerCharacter.conditions.indexOf(condition);
    if (idx >= 0) {
      next.playerCharacter.conditions.splice(idx, 1);
      applied.push(`player condition removed: ${condition}`);
    }
  }

  for (const flag of patch.playerFlagsAdd ?? []) {
    if (!next.playerCharacter.flags.includes(flag)) {
      next.playerCharacter.flags.push(flag);
      applied.push(`player flag added: ${flag}`);
    }
  }
  for (const flag of patch.playerFlagsRemove ?? []) {
    const idx = next.playerCharacter.flags.indexOf(flag);
    if (idx >= 0) {
      next.playerCharacter.flags.splice(idx, 1);
      applied.push(`player flag removed: ${flag}`);
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
