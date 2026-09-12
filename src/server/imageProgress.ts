import type { ImageProgress } from "./imageProvider/types";

/** What `GET /api/images/progress` answers — the frozen shape the client polls
 *  while a slow dialect renders. Numbers the dialect did not report are OMITTED
 *  (not zeroed): the footer shows "Sampling 12/28 · 43%" only when the WebUI
 *  actually said so, and a missing number is "no news", not "zero progress". */
export type ImageProgressSnapshot = {
  active: boolean;
  progress?: number;
  step?: number;
  steps?: number;
  etaSeconds?: number;
};

/** In-memory, per-connection, and deliberately NOT persisted: a progress readout
 *  is only meaningful while the generation that produces it is running, and a
 *  process restart cannot have one in flight. Keyed by the IMAGE CONNECTION id
 *  because that is what the client polls with — the connection it generated
 *  against, not the playthrough or the message. */
const entries = new Map<string, ImageProgressSnapshot>();

/** Record the latest readout for a connection. Called from the adapter's
 *  `onProgress` while a generation is in flight. */
export function publishImageProgress(connectionId: string, progress: ImageProgress): void {
  if (!connectionId) return;
  const snapshot: ImageProgressSnapshot = { active: true, progress: progress.progress };
  if (progress.step !== undefined) snapshot.step = progress.step;
  if (progress.steps !== undefined) snapshot.steps = progress.steps;
  if (progress.etaSeconds !== undefined) snapshot.etaSeconds = progress.etaSeconds;
  entries.set(connectionId, snapshot);
}

/** The current readout. An unknown (or already cleared) connection is simply not
 *  active — a poll that races the start or the end of a generation must answer,
 *  never throw. A copy is returned so a caller cannot mutate the registry. */
export function readImageProgress(connectionId: string): ImageProgressSnapshot {
  const snapshot = entries.get(connectionId);
  return snapshot ? { ...snapshot } : { active: false };
}

/** Drop a connection's readout. Called in the generate route's `finally`, so a
 *  FAILED generation clears it too — a crashed render must not leave a permanent
 *  phantom progress bar in the user's footer. Clearing twice is a no-op. */
export function clearImageProgress(connectionId: string): void {
  entries.delete(connectionId);
}
