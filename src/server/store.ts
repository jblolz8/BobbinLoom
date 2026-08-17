import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { z } from "zod";
import { atomicWriteFile, atomicWriteJson, cleanupStaleTmp, quarantineFile, readJsonFile, timestampSuffix } from "./persistence";
import { migratePlaythrough } from "./dataMigrations";
import { slugify, uniqueSlug } from "./slugs";
import { normalizeCreator, normalizeTags } from "../engine/characterCards";
import type { ParsedCard } from "./characterCards/parseCard";
import { createBlankPlaythrough, createInitialPlaythrough, createPlaythroughFromSeed } from "../engine/engine";
import { DEMO_TEMPLATE } from "../engine/demoData";
import type { CharacterTemplate, LoadFailure, LorebookFile, LorebookSummary, PlayerPersona, Playthrough, PlaythroughListResponse, PromptModuleSet, PromptPreset, ScenarioSeed } from "../schemas";
import { CharacterTemplateSchema, EMPTY_MODULE_SET, PlayerPersonaSchema, PlaythroughSchema } from "../schemas";

function ensureStoreDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  cleanupStaleTmp(dir);
}

/** Timestamped `.bak` rename of a directory (quarantine-style, never deletes). */
function quarantineFolder(dir: string): string | null {
  try {
    if (!existsSync(dir)) return null;
    const target = existsSync(dir + ".bak") ? `${dir}.bak.${timestampSuffix()}` : `${dir}.bak`;
    renameSync(dir, target);
    return target;
  } catch {
    return null;
  }
}

/** True if any *.json file in `folder` parses with the given id. */
function folderContainsId(folder: string, id: string): boolean {
  let files: string[];
  try {
    files = readdirSync(folder).filter((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
  return files.some((f) => {
    const r = readJsonFile(join(folder, f));
    return r.ok && (r.data as { id?: unknown }).id === id;
  });
}

/** Absolute path of the subfolder whose files contain `id` (or null). */
function findFolderContainingId(dir: string, id: string): string | null {
  let folders: string[];
  try {
    folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }
  for (const folder of folders) {
    if (folderContainsId(join(dir, folder), id)) return join(dir, folder);
  }
  return null;
}

function playthroughPath(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

const PERSONAS_DIR = join(process.cwd(), "data", "personas");

// --- Preset helpers ---

export function loadDefaultPreset(): { id: string; name: string; modules: PromptModuleSet } {
  const presetsPath = join(process.cwd(), "data", "prompt-presets.json");
  try {
    const raw = readFileSync(presetsPath, "utf8");
    const presets = JSON.parse(raw) as PromptPreset[];

    // Honour the global default preset from settings.json, falling back to "default".
    const settingsPath = join(process.cwd(), "data", "settings.json");
    let targetId = "default";
    try {
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
        if (settings.defaultPresetId && presets.some((p) => p.id === settings.defaultPresetId)) {
          targetId = settings.defaultPresetId;
        }
      }
    } catch {
      // settings.json missing or malformed — stick with "default"
    }

    const chosen = presets.find((p) => p.id === targetId) ?? presets.find((p) => p.id === "default");
    if (chosen) {
      return {
        id: chosen.id,
        name: chosen.name,
        modules: chosen.modules
      };
    }
  } catch {
    // fall through
  }
  return { id: "default", name: "Default", modules: EMPTY_MODULE_SET };
}

/** All presets from data/prompt-presets.json ([] when missing or unreadable). */
function readAllPresets(): PromptPreset[] {
  try {
    const presetsPath = join(process.cwd(), "data", "prompt-presets.json");
    return JSON.parse(readFileSync(presetsPath, "utf8")) as PromptPreset[];
  } catch {
    return [];
  }
}

/** Resolves the preset for a scenario-generation request: an explicit presetId wins;
 *  without one, the default preset (honoring settings.defaultPresetId) is used so its
 *  seed modules actually reach the Generate Scenario prompt. Returns null only when an
 *  explicit presetId is given but not found — the caller should 404. */
export function resolvePresetForGeneration(
  presetId: string | undefined
): { id: string; name: string; modules: PromptModuleSet } | null {
  if (presetId) {
    const found = readAllPresets().find((p) => p.id === presetId);
    return found ? { id: found.id, name: found.name, modules: found.modules } : null;
  }
  return loadDefaultPreset();
}

// --- Persona CRUD (folder-per-entity: data/personas/<slug>/<slug>.json) ---

function personaFolderPath(dir: string, slug: string): string {
  return join(dir, slug);
}

function personaFilePath(dir: string, slug: string): string {
  return join(personaFolderPath(dir, slug), `${slug}.json`);
}

function personaSlugs(dir: string): Set<string> {
  try {
    return new Set(
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.endsWith(".bak"))
        .map((e) => e.name)
    );
  } catch {
    return new Set();
  }
}

function movePersonaFolder(dir: string, oldSlug: string, newSlug: string): void {
  const from = personaFolderPath(dir, oldSlug);
  if (!existsSync(from)) return;
  const to = personaFolderPath(dir, newSlug);
  if (existsSync(to)) return;
  renameSync(from, to);
  const oldFile = join(to, `${oldSlug}.json`);
  if (existsSync(oldFile)) renameSync(oldFile, join(to, `${newSlug}.json`));
}

/** Write a persona into its home folder (found by id, else its name slug). */
function savePersona(persona: PlayerPersona, dir: string = PERSONAS_DIR): void {
  const home = findFolderContainingId(dir, persona.id) ?? personaFolderPath(dir, slugify(persona.name));
  ensureStoreDir(home);
  const slug = basename(home);
  atomicWriteJson(join(home, `${slug}.json`), persona);
}

/** Scan data/personas/<slug>/ — one PlayerPersona per folder, per-file validated. */
function loadPersonas(dir: string = PERSONAS_DIR): PlayerPersona[] {
  const slugs = [...personaSlugs(dir)].sort();
  const personas: PlayerPersona[] = [];
  for (const slug of slugs) {
    const file = personaFilePath(dir, slug);
    const result = readJsonFile(file);
    if (!result.ok) {
      const backupPath = quarantineFile(file, result.reason);
      console.error(`[store] persona ${slug} unreadable (${result.reason})${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
      continue;
    }
    const parsed = PlayerPersonaSchema.safeParse(result.data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      const backupPath = quarantineFile(file, `invalid persona: ${issues}`);
      console.error(`[store] persona ${slug} failed validation${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
      continue;
    }
    personas.push(parsed.data);
  }
  return personas;
}

export function loadDefaultPersona(): PlayerPersona {
  const personas = loadPersonas();
  if (personas.length === 0) {
    // Fallback — should never happen if data/personas ships correctly
    return {
      id: "persona_default",
      name: "Player",
      description: "A newcomer, ready for anything.",
      bodyType: "average",
      appearance: "Travel-worn clothes, alert posture.",
      initialClothing: [],
      isDefault: true,
    };
  }
  return personas.find((p) => p.isDefault) ?? personas[0];
}

export function getPersona(id: string, dir: string = PERSONAS_DIR): PlayerPersona | null {
  return loadPersonas(dir).find((p) => p.id === id) ?? null;
}

export function listPersonas(dir: string = PERSONAS_DIR): PlayerPersona[] {
  return loadPersonas(dir);
}

export function createPersonaRecord(name: string, cloneFromId?: string, dir: string = PERSONAS_DIR): PlayerPersona {
  const personas = loadPersonas(dir);
  const source = cloneFromId ? personas.find((p) => p.id === cloneFromId) : undefined;

  const persona: PlayerPersona = {
    id: `persona_${Date.now()}`,
    name,
    description: source?.description ?? "",
    bodyType: source?.bodyType ?? "average",
    appearance: source?.appearance ?? "",
    initialClothing: source ? structuredClone(source.initialClothing) : [],
    isDefault: false,
  };

  const slug = uniqueSlug(slugify(name), personaSlugs(dir));
  ensureStoreDir(personaFolderPath(dir, slug));
  atomicWriteJson(personaFilePath(dir, slug), persona);
  return persona;
}

export function updatePersonaRecord(id: string, updates: Partial<PlayerPersona>, dir: string = PERSONAS_DIR): PlayerPersona | null {
  const personas = loadPersonas(dir);
  const index = personas.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const updated = { ...personas[index], ...updates };
  const oldSlug = slugify(personas[index].name);
  const newSlug = slugify(updated.name);
  if (oldSlug !== newSlug) {
    const target = uniqueSlug(newSlug, personaSlugs(dir));
    movePersonaFolder(dir, oldSlug, target);
  }
  savePersona(updated, dir);
  return updated;
}

export function deletePersonaRecord(id: string, dir: string = PERSONAS_DIR): boolean {
  const personas = loadPersonas(dir);
  if (personas.length <= 1) return false;

  const index = personas.findIndex((p) => p.id === id);
  if (index === -1) return false;

  if (personas[index].isDefault) {
    const remaining = personas.filter((_, i) => i !== index);
    savePersona({ ...remaining[0], isDefault: true }, dir);
  }

  const folder = findFolderContainingId(dir, id);
  if (!folder) return false;
  const backup = quarantineFolder(folder);
  console.log(`[store] persona ${id} deleted — folder quarantined${backup ? ` to ${backup}` : ""}`);
  return true;
}

export function setDefaultPersonaRecord(id: string, dir: string = PERSONAS_DIR): PlayerPersona | null {
  const personas = loadPersonas(dir);
  const target = personas.find((p) => p.id === id);
  if (!target) return null;

  for (const p of personas) {
    if (p.isDefault && p.id !== id) savePersona({ ...p, isDefault: false }, dir);
  }
  const updated = { ...target, isDefault: true };
  savePersona(updated, dir);
  return updated;
}

// --- Character template CRUD (folder-per-entity: data/characters/<slug>/<slug>.json, older versions <slug>.v<N>.json) ---
const CHARACTERS_DIR = join(process.cwd(), "data", "characters");

function characterFolderPath(dir: string, slug: string): string {
  return join(dir, slug);
}

function characterFilePath(dir: string, slug: string, version?: number): string {
  return version === undefined
    ? join(characterFolderPath(dir, slug), `${slug}.json`)
    : join(characterFolderPath(dir, slug), `${slug}.v${version}.json`);
}

function characterSlugs(dir: string): Set<string> {
  try {
    return new Set(
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.endsWith(".bak"))
        .map((e) => e.name)
    );
  } catch {
    return new Set();
  }
}

/** Highest version among the JSON files in a character folder. `<slug>.json`
 *  holds the max-version template (its version is read from the file); older
 *  versions carry their version in the filename (`<slug>.v<N>.json`). */
function folderMaxVersion(dir: string, slug: string): number {
  const folderDir = characterFolderPath(dir, slug);
  let files: string[];
  try {
    files = readdirSync(folderDir).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  let max = 0;
  for (const f of files) {
    const m = f.match(/^.+\.v(\d+)\.json$/);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
      continue;
    }
    const r = readJsonFile(join(folderDir, f));
    if (r.ok) {
      const v = (r.data as { version?: unknown }).version;
      if (typeof v === "number") max = Math.max(max, v);
    }
  }
  return max;
}

/** Move a character folder to a new slug, renaming its files to match. */
function moveCharacterFolder(dir: string, oldSlug: string, newSlug: string): void {
  const from = characterFolderPath(dir, oldSlug);
  if (!existsSync(from)) return;
  const to = characterFolderPath(dir, newSlug);
  if (existsSync(to)) return;
  renameSync(from, to);
  let files: string[];
  try {
    files = readdirSync(to).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.startsWith(`${oldSlug}.`)) continue; // skip foreign files
    const m = f.match(/^(.+)\.v(\d+)\.json$/);
    if (m) {
      renameSync(join(to, f), join(to, `${newSlug}.v${m[2]}.json`));
    } else {
      // Rename only the slug prefix so .bl.json / .v<N>.json suffixes survive.
      renameSync(join(to, f), join(to, f.replace(new RegExp("^" + oldSlug), newSlug)));
    }
  }
}

export function listCharacterTemplates(dir: string = CHARACTERS_DIR): CharacterTemplate[] {
  let folders: string[];
  try {
    folders = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.endsWith(".bak"))
      .map((e) => e.name)
      .sort();
  } catch {
    return [DEMO_TEMPLATE]; // missing/unreadable library dir → demo fallback (preserve)
  }
  const templates: CharacterTemplate[] = [];
  for (const folder of folders) {
    const folderDir = join(dir, folder);
    let files: string[];
    try {
      files = readdirSync(folderDir).filter((f) => f.endsWith(".json")).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".card.json")) continue; // raw CCv2 card sidecar (D17)
      const filePath = join(folderDir, file);
      const result = readJsonFile(filePath);
      if (!result.ok) {
        const backupPath = quarantineFile(filePath, result.reason);
        console.error(`[store] character file ${filePath} unreadable (${result.reason})${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
        continue;
      }
      const parsed = CharacterTemplateSchema.safeParse(result.data);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        const backupPath = quarantineFile(filePath, `invalid template: ${issues}`);
        console.error(`[store] character file ${filePath} failed validation${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
        continue;
      }
      const template: CharacterTemplate = { ...parsed.data };
      if (!template.createdAt) {
        const m = template.id.match(/^char_(\d{10,13})$/);
        if (m) {
          const epoch = parseInt(m[1], 10);
          if (!isNaN(epoch) && epoch > 1000000000) {
            template.createdAt = new Date(epoch).toISOString();
          }
        }
        if (!template.createdAt) {
          try {
            const stat = statSync(filePath);
            template.createdAt = stat.birthtime && stat.birthtime.getTime() > 0
              ? stat.birthtime.toISOString()
              : stat.mtime.toISOString();
          } catch {
            /* ignore fallback */
          }
        }
      }
      if (!template.updatedAt) {
        if (template.avatarUpdatedAt) {
          try {
            template.updatedAt = new Date(template.avatarUpdatedAt).toISOString();
          } catch {
            /* ignore */
          }
        }
        if (!template.updatedAt) {
          try {
            const stat = statSync(filePath);
            template.updatedAt = stat.mtime ? stat.mtime.toISOString() : (template.createdAt ?? new Date().toISOString());
          } catch {
            template.updatedAt = template.createdAt ?? new Date().toISOString();
          }
        }
      }
      templates.push(template);
    }
  }
  return templates;
}

export function getCharacterTemplate(id: string, dir: string = CHARACTERS_DIR): CharacterTemplate | null {
  return listCharacterTemplates(dir).find((t) => t.id === id) ?? null;
}

export function getCharacterAvatarPath(
  id: string,
  typeOrDir?: "portrait" | "profile" | "original" | string,
  maybeDir?: string
): string | null {
  const isType = typeOrDir === "portrait" || typeOrDir === "profile" || typeOrDir === "original";
  const type: "portrait" | "profile" | "original" = isType ? (typeOrDir as "portrait" | "profile" | "original") : "portrait";
  const dir = isType ? (maybeDir ?? CHARACTERS_DIR) : (typeOrDir ?? CHARACTERS_DIR);

  const record = listCharacterTemplates(dir).find((t) => t.id === id);
  if (!record) return null;
  const folder = findFolderContainingId(dir, id) ?? characterFolderPath(dir, slugify(record.name));

  if (type === "original") {
    const ref = record.cardRef;
    if (!ref || ref.kind !== "png") return null;
    const file = join(folder, ref.file);
    return existsSync(file) ? file : null;
  }

  if (type === "profile") {
    if (record.profileImage) {
      const file = join(folder, record.profileImage);
      if (existsSync(file)) return file;
    }
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const candidate = join(folder, `profile.${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    // Fall back to portrait if no dedicated profile exists
  }

  // Portrait (default or fallback from profile)
  if (record.customPortrait) {
    const file = join(folder, record.customPortrait);
    if (existsSync(file)) return file;
  }
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join(folder, `portrait.${ext}`);
    if (existsSync(candidate)) return candidate;
  }

  const ref = record.cardRef;
  if (!ref || ref.kind !== "png") return null;
  const file = join(folder, ref.file);
  return existsSync(file) ? file : null;
}

export function saveCharacterAvatar(
  id: string,
  type: "portrait" | "profile",
  buffer: Buffer,
  ext: string = "png",
  dir: string = CHARACTERS_DIR
): CharacterTemplate | null {
  const record = listCharacterTemplates(dir).find((t) => t.id === id);
  if (!record) return null;
  const folder = findFolderContainingId(dir, id) ?? characterFolderPath(dir, slugify(record.name));
  ensureStoreDir(folder);

  const cleanExt = ext.replace(/^\./, "").toLowerCase() || "png";
  const filename = `${type}.${cleanExt}`;
  const filePath = join(folder, filename);
  atomicWriteFile(filePath, buffer);

  const now = Date.now();
  const updates: Partial<CharacterTemplate> = {
    avatarUpdatedAt: now,
    ...(type === "portrait" ? { customPortrait: filename } : { profileImage: filename }),
  };
  return updateCharacterTemplateRecord(id, updates, dir);
}

export function restoreCharacterOriginalAvatar(
  id: string,
  dir: string = CHARACTERS_DIR
): CharacterTemplate | null {
  const record = listCharacterTemplates(dir).find((t) => t.id === id);
  if (!record) return null;
  const folder = findFolderContainingId(dir, id) ?? characterFolderPath(dir, slugify(record.name));

  const originalFile = record.cardRef?.kind === "png" ? record.cardRef.file : null;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join(folder, `portrait.${ext}`);
    if (existsSync(candidate) && basename(candidate) !== originalFile) {
      try {
        unlinkSync(candidate);
      } catch {
        /* ignore */
      }
    }
  }

  const updates: Partial<CharacterTemplate> = {
    customPortrait: undefined,
    avatarUpdatedAt: Date.now(),
  };
  return updateCharacterTemplateRecord(id, updates, dir);
}

export function removeCharacterProfileAvatar(
  id: string,
  dir: string = CHARACTERS_DIR
): CharacterTemplate | null {
  const record = listCharacterTemplates(dir).find((t) => t.id === id);
  if (!record) return null;
  const folder = findFolderContainingId(dir, id) ?? characterFolderPath(dir, slugify(record.name));

  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join(folder, `profile.${ext}`);
    if (existsSync(candidate)) {
      try {
        unlinkSync(candidate);
      } catch {
        /* ignore */
      }
    }
  }

  const updates: Partial<CharacterTemplate> = {
    profileImage: undefined,
    avatarUpdatedAt: Date.now(),
  };
  return updateCharacterTemplateRecord(id, updates, dir);
}

export function createCharacterTemplateRecord(name: string, dir: string = CHARACTERS_DIR): CharacterTemplate {
  const now = new Date().toISOString();
  const template: CharacterTemplate = {
    id: `char_${Date.now()}`,
    name,
    version: 1,
    summary: "",
    startingClothing: [],
    spec: "bobbinloom_chara",
    specVersion: "1.0",
    tags: [],
    extensions: {},
    content: "[Species]: (unknown)\\n[Gender]: (unknown)\\n\\n[Body]\\n(no details recorded yet)\\n\\n[Personality]\\n(no details recorded yet)\\n\\n[Communication]\\n(no details recorded yet)\\n\\n[Likes]\\n(not established)\\n\\n[Dislikes]\\n(not established)",
    createdAt: now,
    updatedAt: now,
  };
  const slug = uniqueSlug(slugify(name), characterSlugs(dir));
  ensureStoreDir(characterFolderPath(dir, slug));
  atomicWriteJson(characterFilePath(dir, slug), template); // latest = <slug>.json
  return template;
}

export function updateCharacterTemplateRecord(id: string, updates: Partial<CharacterTemplate>, dir: string = CHARACTERS_DIR): CharacterTemplate | null {
  const templates = listCharacterTemplates(dir);
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const now = new Date().toISOString();
  const updated: CharacterTemplate = {
    ...templates[index],
    ...updates,
    id,
    createdAt: templates[index].createdAt ?? now,
    updatedAt: updates.updatedAt ?? now,
  };
  saveCharacterTemplateRecord(updated, dir);
  return updated;
}

/** After a CCv2 card is converted to BL, the converted record is written to
 *  `<slug>.json` (via saveCharacterTemplateRecord), but the original import
 *  record at `<slug>.bl.json` (same id, still `format:"ccv2"`) would otherwise
 *  remain. That leaves two records for one card — making converted cards show
 *  "(2 versions)" and still display as CCv2 (the `.bl.json` sorts first).
 *  Remove the stale import record, keeping the raw original (.png/.card.json). */
export function removeCharacterImportRecord(id: string, dir: string = CHARACTERS_DIR): void {
  const folder = findFolderContainingId(dir, id);
  if (!folder) return;
  const slug = basename(folder);
  const importRecord = join(folder, `${slug}.bl.json`);
  if (!existsSync(importRecord)) return;
  const r = readJsonFile(importRecord);
  if (r.ok && (r.data as { id?: unknown }).id === id) {
    unlinkSync(importRecord);
    console.log(`[store] removed stale CCv2 import record ${importRecord} (id ${id})`);
  }
}

export function deleteCharacterTemplateRecord(id: string, dir: string = CHARACTERS_DIR): boolean {
  if (!listCharacterTemplates(dir).some((t) => t.id === id)) return false;
  const folder = findFolderContainingId(dir, id);
  if (!folder) return false;
  const backup = quarantineFolder(folder);
  console.log(`[store] character ${id} deleted — folder quarantined${backup ? ` to ${backup}` : ""}`);
  return true;
}

/** Upsert — used by Save to Library + editor updates. Creates or updates by template id.
 *  Latest version of a folder lives at `<slug>.json`; older versions as `<slug>.v<N>.json`.
 *  Renames move the folder (id unchanged). */
export function saveCharacterTemplateRecord(template: CharacterTemplate, dir: string = CHARACTERS_DIR): CharacterTemplate {
  const templates = listCharacterTemplates(dir);
  const existing = templates.find((t) => t.id === template.id);
  const slugs = characterSlugs(dir);
  const nameSlug = slugify(template.name);
  let slug: string;
  if (existing) {
    slug = slugify(existing.name);
    if (nameSlug !== slug) {
      slug = uniqueSlug(nameSlug, slugs);
      moveCharacterFolder(dir, slugify(existing.name), slug);
    }
  } else {
    slug = uniqueSlug(nameSlug, slugs);
  }
  ensureStoreDir(characterFolderPath(dir, slug));
  const now = new Date().toISOString();
  const recordToSave: CharacterTemplate = {
    ...template,
    createdAt: template.createdAt ?? existing?.createdAt ?? now,
    updatedAt: template.updatedAt ?? now,
  };
  const maxV = folderMaxVersion(dir, slug);
  if (recordToSave.version >= maxV) {
    // Latest lands at <slug>.json — demote the previous holder first.
    const latestPath = characterFilePath(dir, slug);
    if (existsSync(latestPath)) {
      const r = readJsonFile(latestPath);
      if (r.ok) {
        const oldV = (r.data as { version?: unknown }).version;
        if (typeof oldV === "number" && oldV < recordToSave.version) {
          renameSync(latestPath, characterFilePath(dir, slug, oldV));
        }
      }
    }
    atomicWriteJson(latestPath, recordToSave);
  } else {
    atomicWriteJson(characterFilePath(dir, slug, recordToSave.version), recordToSave);
  }
  return recordToSave;
}

export interface ImportResult { record: CharacterTemplate; created: boolean }

/** Persist an imported CCv2 card: untouched original file + .bl.json record.
 *  Upserts when a record with the same name+creator exists (D11). */
export function importCharacterCard(
  card: ParsedCard,
  originalBytes: Buffer,
  kind: "png" | "json",
  dir: string = CHARACTERS_DIR
): ImportResult {
  const existing = listCharacterTemplates(dir).find(
    (t) => t.format === "ccv2" && t.name === card.name && (t.creator ?? "") === normalizeCreator(card.creator)
  );
  let slug: string;
  if (existing) {
    slug = slugify(existing.name);
  } else {
    slug = uniqueSlug(slugify(card.name), characterSlugs(dir));
    ensureStoreDir(characterFolderPath(dir, slug));
  }
  const folder = characterFolderPath(dir, slug);
  const originalFile = kind === "png" ? `${slug}.png` : `${slug}.card.json`;
  atomicWriteFile(join(folder, originalFile), originalBytes); // raw, untouched
  const now = new Date().toISOString();
  const record: CharacterTemplate = {
    id: existing?.id ?? `char_${Date.now()}`,
    name: card.name,
    version: 1,
    content: card.description,
    summary: "",
    startingClothing: [],
    spec: "bobbinloom_chara",
    specVersion: "1.0",
    title: card.name,                 // D16
    creatorNotes: card.creatorNotes,
    creator: normalizeCreator(card.creator),  // D4
    tags: normalizeTags(card.tags),           // D4
    extensions: {},
    format: "ccv2",
    cardRef: { file: originalFile, kind },
    cardVersion: card.characterVersion || undefined,
    scenario: card.scenario || undefined,     // D7
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  atomicWriteJson(join(folder, `${slug}.bl.json`), record);
  return { record, created: !existing };
}

/** Resolve castIds against the LIBRARY (CHARACTERS_DIR). Unknown ids are skipped; CCv2
 *  records are excluded. Undefined = no picker involvement (engine default applies).
 *  `dir` overrides the characters dir for hermetic tests ONLY — production callers
 *  must NOT pass their playthroughs dir here (it differs from CHARACTERS_DIR). */
export function resolveCast(castIds?: string[], dir: string = CHARACTERS_DIR): CharacterTemplate[] | undefined {
  if (!castIds) return undefined;
  const library = listCharacterTemplates(dir);
  return castIds
    .map((id) => library.find((t) => t.id === id))
    .filter((t): t is CharacterTemplate => t !== undefined && t.format !== "ccv2");
}

export function createBlankPlaythroughRecord(
  dir: string, name: string, personaId?: string, castIds: string[] = [], lorebookIds?: string[],
  scenarioDescription?: string, presetOverride?: { id: string; name: string; modules: PromptModuleSet }
): Playthrough {
  const preset = presetOverride ?? loadDefaultPreset();
  const persona = personaId ? (getPersona(personaId) ?? loadDefaultPersona()) : loadDefaultPersona();
  const cast = resolveCast(castIds) ?? [];
  const playthrough = createBlankPlaythrough(name, preset.modules, preset.id, preset.name, persona, cast);
  if (lorebookIds) playthrough.lorebookIds = lorebookIds;
  if (scenarioDescription) playthrough.scenarioDescription = scenarioDescription;
  if (personaId) playthrough.personaId = personaId;
  if (castIds.length > 0) playthrough.initialCastIds = castIds;
  updatePlaythroughRecord(dir, playthrough);
  return playthrough;
}

export function createPlaythroughRecord(dir: string, name: string, personaId?: string, castIds?: string[], lorebookIds?: string[], scenarioDescription?: string, presetOverride?: { id: string; name: string; modules: PromptModuleSet }): Playthrough {
  const preset = presetOverride ?? loadDefaultPreset();
  const persona = personaId ? (getPersona(personaId) ?? loadDefaultPersona()) : loadDefaultPersona();
  const cast = resolveCast(castIds);
  const playthrough = createInitialPlaythrough(name, preset.modules, preset.id, preset.name, persona, cast);
  if (lorebookIds) playthrough.lorebookIds = lorebookIds;
  if (scenarioDescription) playthrough.scenarioDescription = scenarioDescription;
  if (personaId) playthrough.personaId = personaId;
  if (castIds && castIds.length > 0) playthrough.initialCastIds = castIds;
  updatePlaythroughRecord(dir, playthrough);
  return playthrough;
}

/**
 * Builds a playthrough in memory from an AI-generated scenario seed.
 * Deliberately does NOT persist — the /api/playthroughs/generate route runs
 * the opening turn first and only writes the record once that succeeds, so a
 * failed opening turn can never leave an orphaned seed-only playthrough on disk.
 */
export function createPlaythroughFromSeedRecord(
  dir: string, name: string, seed: ScenarioSeed, personaId?: string, castIds?: string[], lorebookIds?: string[],
  scenarioDescription?: string, presetOverride?: { id: string; name: string; modules: PromptModuleSet },
  includeOpening = true
): Playthrough {
  const preset = presetOverride ?? loadDefaultPreset();
  const persona = personaId ? (getPersona(personaId) ?? loadDefaultPersona()) : loadDefaultPersona();
  const playthrough = createPlaythroughFromSeed(name, seed, preset.modules, preset.id, preset.name, persona, resolveCast(castIds), includeOpening);
  if (lorebookIds) playthrough.lorebookIds = lorebookIds;
  if (scenarioDescription) playthrough.scenarioDescription = scenarioDescription;
  if (personaId) playthrough.personaId = personaId;
  if (castIds && castIds.length > 0) playthrough.initialCastIds = castIds;
  return playthrough;
}

export function getPlaythroughRecord(dir: string, id: string): Playthrough | null {
  const path = playthroughPath(dir, id);
  const result = readJsonFile(path);
  if (!result.ok) {
    if (result.reason !== "missing") {
      // Unparseable JSON → quarantine + report (tier-2 contract; route 404s)
      const backupPath = quarantineFile(path, result.reason);
      console.error(`[store] playthrough ${id} unreadable (${result.reason})${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
    }
    return null;
  }
  const migrated = migratePlaythrough(result.data);
  if (!migrated.ok) {
    const backupPath = quarantineFile(path, migrated.reason);
    console.error(`[store] playthrough ${id} failed validation (${migrated.reason})${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
    return null;
  }
  return migrated.data;
}

export function updatePlaythroughRecord(dir: string, playthrough: Playthrough): void {
  // Validate-on-write canary (decision 6): never persist an invalid playthrough.
  const parsed = PlaythroughSchema.safeParse(playthrough);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`refusing to persist invalid playthrough ${playthrough.id}: ${issues}`);
  }
  ensureStoreDir(dir);
  // Write the ORIGINAL in-memory object (not the parsed copy).
  atomicWriteJson(playthroughPath(dir, playthrough.id), playthrough);
}

export function deletePlaythroughRecord(dir: string, id: string): boolean {
  const path = playthroughPath(dir, id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export function renamePlaythroughRecord(dir: string, id: string, name: string): Playthrough | null {
  const playthrough = getPlaythroughRecord(dir, id);
  if (!playthrough) return null;
  playthrough.name = name;
  playthrough.updatedAt = new Date().toISOString();
  updatePlaythroughRecord(dir, playthrough);
  return playthrough;
}

/**
 * Deep-clone an existing playthrough into a new file with a fresh id.
 * Everything is copied — messages, snapshots, chapters, world state — so the
 * duplicate is an exact checkpoint the player can branch from. The name gets
 * a " (copy)" suffix to make it distinguishable in the save/load list.
 */
export function duplicatePlaythroughRecord(dir: string, id: string): Playthrough | null {
  const original = getPlaythroughRecord(dir, id);
  if (!original) return null;

  const clone = structuredClone(original);
  clone.id = `play_${randomUUID()}`;
  clone.name = `${original.name} (copy)`;
  const now = new Date().toISOString();
  clone.createdAt = now;
  clone.updatedAt = now;

  updatePlaythroughRecord(dir, clone);
  return clone;
}

export function listPlaythroughRecords(dir: string): PlaythroughListResponse {
  ensureStoreDir(dir);
  const playthroughs: Playthrough[] = [];
  const failures: LoadFailure[] = [];
  // Per-file try/catch — one corrupt file must NOT brick the whole list.
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const id = file.replace(/\.json$/, "");
    const path = join(dir, file);
    try {
      const result = readJsonFile(path);
      if (!result.ok) throw new Error(result.reason);
      const migrated = migratePlaythrough(result.data);
      if (!migrated.ok) throw new Error(migrated.reason);
      playthroughs.push(migrated.data);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      // Best-effort name from the raw file BEFORE quarantine
      let name = id;
      try {
        const raw = JSON.parse(readFileSync(path, "utf8")) as { name?: unknown };
        if (raw && typeof raw.name === "string") name = raw.name;
      } catch {
        // unparseable — name stays as the filename
      }
      const backupPath = quarantineFile(path, reason);
      failures.push({ id, name, reason, backupPath: backupPath ?? undefined });
      console.error(`[store] playthrough ${id} failed to load (${reason})${backupPath ? ` — quarantined to ${backupPath}` : ""}`);
    }
  }
  playthroughs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { playthroughs, failures };
}

// ── Lorebook store ──

const LOREBOOKS_DIR = join(process.cwd(), "data", "lorebooks");

function lorebookPath(id: string): string {
  return join(LOREBOOKS_DIR, `${id}.json`);
}

export function listLorebooks(dir?: string): LorebookSummary[] {
  const dirPath = dir ?? LOREBOOKS_DIR;
  ensureStoreDir(dirPath);
  const files = readdirSync(dirPath, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));

  return files.map(f => {
    const id = f.name.replace(/\.json$/i, "");
    try {
      const raw = readFileSync(join(dirPath, f.name), "utf8");
      const data = JSON.parse(raw);
      return {
        id,
        name: data.name || id,
        entryCount: Object.keys(data.entries || {}).length,
        scanDepth: data.scanDepth ?? 2,
      };
    } catch {
      return { id, name: id, entryCount: 0, scanDepth: 2 };
    }
  });
}

export function getLorebook(id: string, dir?: string): LorebookFile | null {
  const dirPath = dir ?? LOREBOOKS_DIR;
  const path = lorebookPath(id);
  // Replace with dir-aware path if dir is provided
  const actualPath = dir ? join(dir, `${id}.json`) : path;
  if (!existsSync(actualPath)) return null;
  try {
    const raw = readFileSync(actualPath, "utf8");
    const data = JSON.parse(raw);
    // Normalize: ensure entries are keyed by uid as strings
    return data as LorebookFile;
  } catch {
    return null;
  }
}

export function saveLorebook(id: string, data: LorebookFile, dir?: string): void {
  const dirPath = dir ?? LOREBOOKS_DIR;
  ensureStoreDir(dirPath);
  const path = dir ? join(dir, `${id}.json`) : lorebookPath(id);
  atomicWriteJson(path, data);
}

export function deleteLorebook(id: string, dir?: string): boolean {
  const dirPath = dir ?? LOREBOOKS_DIR;
  const path = dir ? join(dir, `${id}.json`) : lorebookPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
