import { PlaythroughSchema } from "../schemas";
import type { Playthrough } from "../schemas";

/** Shared migration result: `migratedFrom` is set only when a version chain
 *  actually ran (a bare-array v0 → v1 wrap reports 0; default-fills stay lazy
 *  and report nothing). */
export type MigrationResult<T> =
  | { ok: true; data: T; migratedFrom?: number }
  | { ok: false; reason: string };

export const CURRENT_PLAYTHROUGH_VERSION = 2;

type MigrationFn = (raw: unknown) => unknown;

/** Version chains: maps a source version to the migration producing the next
 *  version's shape. Empty today (v1 is current) — the seam is the machinery,
 *  exercised by synthetic fixtures. */
const playthroughMigrations: Record<number, MigrationFn> = {
  1: (raw: any) => {
    const data = { ...raw };
    
    // Helper to migrate worldState for a given state object (root or snapshot)
    const migrateWorldState = (stateObj: any) => {
      stateObj.worldState = stateObj.worldState || [];
      let idCounter = 1;
      if (Array.isArray(stateObj.flags)) {
        for (const flag of stateObj.flags) {
          if (typeof flag === "string") {
            stateObj.worldState.push({ id: `ws_mig_f_${idCounter++}`, name: flag, description: "" });
          }
        }
      }
      if (Array.isArray(stateObj.quests)) {
        for (const quest of stateObj.quests) {
          if (quest && typeof quest === "object" && typeof quest.name === "string") {
            const status = quest.status ? ` [${quest.status}]` : "";
            stateObj.worldState.push({
              id: quest.id || `ws_mig_q_${idCounter++}`,
              name: quest.name + status,
              description: typeof quest.summary === "string" ? quest.summary : ""
            });
          }
        }
      }
      delete stateObj.flags;
      delete stateObj.quests;
    };

    // Migrate root
    migrateWorldState(data);
    data.activeCharacters = data.activeCharacters ?? (Array.isArray(data.characters) ? data.characters.map((c: any) => c.id) : []);
    
    delete data.npcs;
    delete data.locationCatalog;
    delete data.locationId;

    // Migrate snapshots
    if (data.snapshots && typeof data.snapshots === "object") {
      for (const key of Object.keys(data.snapshots)) {
        const snap = data.snapshots[key];
        if (snap && typeof snap === "object") {
          migrateWorldState(snap);
          snap.activeCharacters = snap.activeCharacters ?? (Array.isArray(snap.characters) ? snap.characters.map((c: any) => c.id) : []);
        }
      }
    }
    
    data.schemaVersion = 2;
    return data;
  }
};

function extractVersion(raw: unknown): number | undefined {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>).schemaVersion;
    if (typeof v === "number" && Number.isInteger(v)) return v;
  }
  return undefined;
}

/** Run the chain from `fromVersion` up to (not including) `current`. Stops
 *  early if a step is missing (treats that version as terminal). */
function runChain(
  raw: unknown,
  fromVersion: number,
  chain: Record<number, MigrationFn>,
  current: number
): { data: unknown; migratedFrom?: number } {
  let data = raw;
  let version = fromVersion;
  while (version < current) {
    const step = chain[version];
    if (!step) break;
    data = step(data);
    version += 1;
  }
  return version > fromVersion ? { data, migratedFrom: fromVersion } : { data };
}

function formatZodIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Migrate + validate a raw playthrough file. Files without a `schemaVersion`
 *  are treated as v1 (default-filled lazily by PlaythroughSchema — in memory
 *  only, no write). Future versions are never downgraded. */
export function migratePlaythrough(raw: unknown): MigrationResult<Playthrough> {
  const version = extractVersion(raw);
  if (version !== undefined && version > CURRENT_PLAYTHROUGH_VERSION) {
    return { ok: false, reason: "newer than supported" };
  }
  const from = version ?? 1;
  const { data, migratedFrom } = runChain(
    raw,
    from,
    playthroughMigrations,
    CURRENT_PLAYTHROUGH_VERSION
  );
  const parsed = PlaythroughSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: `invalid playthrough: ${formatZodIssues(parsed.error.issues)}` };
  }
  return migratedFrom !== undefined
    ? { ok: true, data: parsed.data, migratedFrom }
    : { ok: true, data: parsed.data };
}
