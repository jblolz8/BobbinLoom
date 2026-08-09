import type { LorebookFile, LorebookSummary } from "../../schemas";
import { request } from "./client";

export function listLorebooks(): Promise<LorebookSummary[]> {
  return request<LorebookSummary[]>("/api/lorebooks");
}

export function getLorebook(id: string): Promise<LorebookFile> {
  return request<LorebookFile>(`/api/lorebooks/${id}`);
}

export function createLorebook(name: string): Promise<LorebookFile> {
  return request<LorebookFile>("/api/lorebooks", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function saveLorebook(id: string, data: LorebookFile): Promise<LorebookFile> {
  return request<LorebookFile>(`/api/lorebooks/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function deleteLorebook(id: string): Promise<void> {
  return request<void>(`/api/lorebooks/${id}`, { method: "DELETE" });
}

export function importLorebook(filename: string, contents: unknown): Promise<LorebookFile> {
  return request<LorebookFile>("/api/lorebooks/import", {
    method: "POST",
    body: JSON.stringify({ filename, contents })
  });
}
