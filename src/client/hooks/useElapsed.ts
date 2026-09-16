import { useEffect, useState } from "react";

/**
 * Milliseconds elapsed since `startedAt`, ticking while a phase is active.
 *
 * `startedAt` is a timestamp the phase OWNER sets once, when the phase begins.
 * It must never be derived from a message id or a progress payload: the a1111
 * progress poll lands every 700ms (and the prompt/response state flips more
 * often than that), so a clock derived from those would restart on every update
 * and the counter would appear to stall.
 *
 * Inactive (`null` stamp, or `active: false`) returns `null` and schedules
 * nothing, so a cancelled phase leaves no interval running.
 *
 * The clock is `performance.now()`, matching the stamps: the hook that owns the
 * phases already measures with it, and a monotonic clock cannot jump backwards
 * mid-phase the way a wall clock can. Mixing the two is not a rounding error —
 * `Date.now() - performance.now()` is roughly the machine's uptime.
 */
export function useElapsed(
  startedAt: number | null,
  active: boolean,
  intervalMs = 200
): number | null {
  const [elapsed, setElapsed] = useState<number | null>(() =>
    startedAt === null ? null : performance.now() - startedAt
  );

  useEffect(() => {
    if (!active || startedAt === null) {
      setElapsed(null);
      return;
    }
    // Publish immediately: a phase that resolves inside one tick (a fast local
    // text call) still shows a number rather than nothing.
    setElapsed(performance.now() - startedAt);
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt), intervalMs);
    return () => window.clearInterval(timer);
  }, [startedAt, active, intervalMs]);

  return elapsed;
}
