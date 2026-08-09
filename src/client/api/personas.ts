import { request } from "./client";

export type Persona = {
  id: string;
  name: string;
  description: string;
  bodyType: string;
  appearance: string;
  initialClothing: Array<{ slot: string; name: string; state?: string }>;
  isDefault: boolean;
};

export type PersonaUpdate = Partial<Pick<Persona, "name" | "description" | "bodyType" | "appearance" | "initialClothing">>;

export function listPersonas(): Promise<Persona[]> {
  return request<Persona[]>("/api/personas");
}

export function getPersona(id: string): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}`);
}

export function createPersona(name: string, cloneFromId?: string): Promise<Persona> {
  return request<Persona>("/api/personas", {
    method: "POST",
    body: JSON.stringify({ name, cloneFromId })
  });
}

export function updatePersona(id: string, updates: PersonaUpdate): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
}

export function deletePersona(id: string): Promise<void> {
  return request<void>(`/api/personas/${id}`, { method: "DELETE" });
}

export function setDefaultPersona(id: string): Promise<Persona> {
  return request<Persona>(`/api/personas/${id}/set-default`, { method: "POST" });
}
