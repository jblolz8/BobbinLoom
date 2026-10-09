export type GenerationProgressSnapshot = { active: boolean; phase?: string; };
const entries = new Map<string, GenerationProgressSnapshot>();
export function publishGenerationProgress(sessionId: string, phase: string): void { entries.set(sessionId, { active: true, phase }); }
export function readGenerationProgress(sessionId: string): GenerationProgressSnapshot { return entries.get(sessionId) ?? { active: false }; }
export function clearGenerationProgress(sessionId: string): void { entries.delete(sessionId); }
