/**
 * Lightweight haptic vibration feedback for mobile/touch devices.
 * Uses the Web Vibration API with safe feature detection and error handling.
 */
export function triggerHaptic(durationMs = 8): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Ignore if vibrations are blocked by permissions or unsupported
    }
  }
}
