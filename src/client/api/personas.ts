import type { ExportFormat } from "../../schemas";
import { request } from "./client";

export type Persona = {
  id: string;
  name: string;
  description: string;
  bodyType: string;
  appearance: string;
  initialClothing: Array<{ slot: string; name: string; state?: string }>;
  isDefault: boolean;
  customPortrait?: string;
  profileImage?: string;
  avatarUpdatedAt?: number;
};

export type PersonaUpdate = Partial<
  Pick<
    Persona,
    "name" | "description" | "bodyType" | "appearance" | "initialClothing"
  >
>;

export function listPersonas(): Promise<Persona[]> {
  return request<Persona[]>("/api/personas");
}

export function getPersona(id: string): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}`);
}

export function createPersona(
  name: string,
  cloneFromId?: string,
): Promise<Persona> {
  return request<Persona>("/api/personas", {
    method: "POST",
    body: JSON.stringify({ name, cloneFromId }),
  });
}

export function updatePersona(
  id: string,
  updates: PersonaUpdate,
): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function deletePersona(id: string): Promise<void> {
  return request<void>(`/api/personas/${id}`, { method: "DELETE" });
}

export function setDefaultPersona(id: string): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}/set-default`, {
    method: "POST",
  });
}

export function uploadPersonaAvatar(
  id: string,
  type: "portrait" | "profile",
  dataBase64: string,
  fileName?: string,
): Promise<{ record: Persona }> {
  return request<{ record: Persona }>(`/api/personas/${id}/avatar`, {
    method: "POST",
    body: JSON.stringify({ type, dataBase64, fileName }),
  });
}

export function deletePersonaPortraitAvatar(
  id: string,
): Promise<{ record: Persona }> {
  return request<{ record: Persona }>(`/api/personas/${id}/avatar/portrait`, {
    method: "DELETE",
  });
}

export function deletePersonaProfileAvatar(
  id: string,
): Promise<{ record: Persona }> {
  return request<{ record: Persona }>(`/api/personas/${id}/avatar/profile`, {
    method: "DELETE",
  });
}

export function getPersonaAvatarUrl(
  id: string,
  type: "portrait" | "profile" = "portrait",
  updatedAt?: number,
): string {
  const query = new URLSearchParams();
  if (type !== "portrait") query.set("type", type);
  if (updatedAt) query.set("t", String(updatedAt));
  const qs = query.toString();
  return `/api/personas/${id}/avatar${qs ? `?${qs}` : ""}`;
}

export async function downloadPersonaExport(
  id: string,
  name: string,
  format: ExportFormat,
): Promise<void> {
  const res = await fetch(
    `/api/personas/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
  );
  if (!res.ok) {
    let errText = "Failed to export persona.";
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errText = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(errText);
  }
  const actualFormat = (res.headers.get("X-Export-Format") ||
    format) as ExportFormat;
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const fallbackSlug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "persona";
  const filename =
    filenameMatch?.[1] ?? `${fallbackSlug}.persona.${actualFormat}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function importPersonaData(
  dataBase64: string,
  fileName?: string,
): Promise<{ record: Persona }> {
  return request<{ record: Persona }>("/api/personas/import", {
    method: "POST",
    body: JSON.stringify({ dataBase64, fileName }),
  });
}
