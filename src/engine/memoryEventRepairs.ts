import type { Playthrough, MemoryEvent } from "../schemas";

/**
 * Repairs memory event turns that were corrupted by the turn-overwriting bug
 * (where historical events all collapsed into the latest turn number).
 *
 * It uses the immutable assistant messages log:
 * 1. Primary match: Assistant messages whose `patchInfo.applied` contains
 *    `"memory event added: <summary>"` provide the exact turn number the event was created on.
 * 2. Secondary match: For events not found in patchInfo, matches by `createdAt` timestamp
 *    proximity to the corresponding assistant message.
 *
 * Returns `true` if any event turns were repaired, `false` otherwise.
 */
export function repairMemoryEventTurns(playthrough: Playthrough): boolean {
  if (!playthrough.messages || playthrough.messages.length === 0) {
    return false;
  }

  // 1. Build a map of event summary -> turn from assistant messages
  const summaryToTurn = new Map<string, number>();
  const messagesWithTurn: Array<{ turn: number; time: number }> = [];

  for (const msg of playthrough.messages) {
    if (typeof msg.turn === "number") {
      if (msg.createdAt) {
        const time = new Date(msg.createdAt).getTime();
        if (!Number.isNaN(time)) {
          messagesWithTurn.push({ turn: msg.turn, time });
        }
      }

      if (msg.role === "assistant" && msg.patchInfo?.applied) {
        for (const line of msg.patchInfo.applied) {
          if (
            typeof line === "string" &&
            line.startsWith("memory event added: ")
          ) {
            const summary = line.slice("memory event added: ".length).trim();
            if (summary && !summaryToTurn.has(summary)) {
              summaryToTurn.set(summary, msg.turn);
            }
          }
        }
      }
    }
  }

  let modified = false;

  const repairEvent = (event: MemoryEvent) => {
    // Primary: match by exact summary recorded in patchInfo
    const exactTurn = summaryToTurn.get(event.summary?.trim());
    if (exactTurn !== undefined && exactTurn > 0) {
      if (event.turn !== exactTurn) {
        event.turn = exactTurn;
        modified = true;
      }
      return;
    }

    // Secondary: if event has createdAt and messages exist, match by closest timestamp
    if (event.createdAt && messagesWithTurn.length > 0) {
      const eventTime = new Date(event.createdAt).getTime();
      if (!Number.isNaN(eventTime)) {
        let bestTurn: number | null = null;
        let minDiff = Infinity;
        for (const m of messagesWithTurn) {
          const diff = Math.abs(m.time - eventTime);
          if (diff < minDiff && diff < 60_000) {
            // within 60s
            minDiff = diff;
            bestTurn = m.turn;
          }
        }
        if (bestTurn !== null && bestTurn > 0 && event.turn !== bestTurn) {
          event.turn = bestTurn;
          modified = true;
        }
      }
    }
  };

  for (const event of playthrough.memoryEvents ?? []) {
    repairEvent(event);
  }

  if (playthrough.memoryLayers) {
    for (const event of playthrough.memoryLayers.recent ?? []) {
      repairEvent(event);
    }
    for (const event of playthrough.memoryLayers.compressed ?? []) {
      repairEvent(event);
    }
  }

  return modified;
}
