export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const response = await fetch(url, {
    ...init,
    headers: {
      // Only declare JSON when sending a body (Fastify rejects empty body with JSON header)
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (text ? JSON.parse(text) : undefined) as T;
}
