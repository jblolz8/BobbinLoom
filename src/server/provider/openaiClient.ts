import type { ResolvedProviderConfig } from "../providerConfig";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function linkExternalAbort(external: AbortSignal | undefined, internal: AbortController): () => void {
  if (!external) return () => {};
  if (external.aborted) {
    internal.abort();
    return () => {};
  }
  const onAbort = () => internal.abort();
  external.addEventListener("abort", onAbort, { once: true });
  return () => external.removeEventListener("abort", onAbort);
}

export async function requestOnce(
  config: ResolvedProviderConfig,
  fetchImpl: typeof fetch,
  body: Record<string, unknown>,
  path: string = "/chat/completions",
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 60_000);
  const unlink = linkExternalAbort(signal, controller);

  try {
    return await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

export async function requestWithRetry(
  config: ResolvedProviderConfig,
  fetchImpl: typeof fetch,
  body: Record<string, unknown>,
  path: string = "/chat/completions",
  validate?: (text: string) => string | null,
  signal?: AbortSignal
): Promise<Response> {
  const maxRetries = config.maxRetries ?? 1;
  let attempt = 0;
  let lastError: unknown = null;
  let jsonFallbackTried = false;

  const inspect = async (response: Response): Promise<{ response: Response; acceptable: boolean }> => {
    if (!validate) return { response, acceptable: true };
    const text = await response.text();
    const problem = validate(text);
    const reWrapped = new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
    if (problem === null) return { response: reWrapped, acceptable: true };
    lastError = new Error(problem);
    return { response: reWrapped, acceptable: false };
  };

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      lastError = new Error("Request aborted by the client");
      break;
    }
    try {
      const response = await requestOnce(config, fetchImpl, body, path, signal);
      if (response.ok) {
        const inspected = await inspect(response);
        if (inspected.acceptable) return inspected.response;
        if (attempt === maxRetries) return inspected.response;
        attempt += 1;
        continue;
      }

      if (!jsonFallbackTried && "response_format" in body &&
          (response.status === 400 || response.status === 422 || response.status === 404)) {
        jsonFallbackTried = true;
        const fallbackBody: Record<string, unknown> = { ...body };
        delete fallbackBody.response_format;
        const fallback = await requestOnce(config, fetchImpl, fallbackBody, path, signal);
        if (fallback.ok) {
          const inspected = await inspect(fallback);
          if (inspected.acceptable) return inspected.response;
          if (attempt === maxRetries) return inspected.response;
          attempt += 1;
          continue;
        }
        const text = await fallback.text();
        throw new Error(`Provider request failed: ${fallback.status} ${text}`);
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries) {
        const text = await response.text();
        throw new Error(`Provider request failed: ${response.status} ${text}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || jsonFallbackTried || signal?.aborted) break;
    }

    attempt += 1;
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
