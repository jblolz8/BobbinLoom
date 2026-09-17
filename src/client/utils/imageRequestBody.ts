/**
 * The re-send path's body: formatting it for the editor, and the one rule it has
 * to satisfy before it is posted.
 *
 * Pure and renderer-free on purpose — the repo has no component test harness, so
 * the part of the editor worth testing lives here. The rule is deliberately the
 * same one the server enforces (`parseRawRequestBody` in `routes/images.ts`):
 * a body must parse as a JSON OBJECT and nothing more. Which keys a dialect
 * accepts is the provider's business, so nothing here inspects them.
 */

export type ImageRequestBodyCheck =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/** The body as it should appear in the editor: pretty-printed when it parses,
 *  and handed back untouched when it does not — an unreadable body is exactly
 *  the one the user needs to see, so this never blanks or reformats it away. */
export function formatImageRequestBody(request: string): string {
  try {
    const parsed: unknown = JSON.parse(request);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return request;
  }
}

/** Whether this text can be sent, with the reason when it cannot. */
export function checkImageRequestBody(text: string): ImageRequestBodyCheck {
  if (!text.trim()) return { ok: false, error: "The request body is empty." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `This is not valid JSON — ${detail}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "The request body must be a JSON object." };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
