import type { ImageApiStyle } from "../schemas";

/** A1111 is commonly protected by `--api-auth user:pass` (HTTP Basic) or
 *  `--api-key` (Bearer). One field, disambiguated by the colon — `user:pass`
 *  cannot be mistaken for a bearer token, and a token never contains one.
 *
 *  Shared by the image adapter and the models probe so the two can never
 *  disagree about how a key is presented. Non-a1111 dialects are always
 *  Bearer: an OpenAI-compatible or Venice key that happens to contain a colon
 *  is still a token, not a credential pair. */
export function authHeaders(apiKey: string | undefined, apiStyle: ImageApiStyle = "openai"): Record<string, string> {
  const key = apiKey?.trim();
  if (!key) return {};
  if (apiStyle === "a1111" && key.includes(":")) {
    return { Authorization: `Basic ${Buffer.from(key).toString("base64")}` };
  }
  return { Authorization: `Bearer ${key}` };
}
