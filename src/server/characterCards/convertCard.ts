import type { CharacterTemplate, PromptPresetModule } from "../../schemas";
import { ensureAllSections } from "../../engine/characterSections";
import type { TurnProvider } from "../provider";

export interface ConvertGenerateInput {
  template: CharacterTemplate;
  feedback?: string;
  modules?: PromptPresetModule[];
}

export interface ConvertGenerateOutput {
  content: string;
}

/**
 * Generate a BL-format character sheet from a CCv2 card.
 * Calls the AI provider's generateCharacterSheet with card metadata as context.
 */
export async function convertCardGenerate(
  provider: TurnProvider,
  input: ConvertGenerateInput,
  signal?: AbortSignal
): Promise<ConvertGenerateOutput> {
  const t = input.template;

  // Build story context from card metadata
  const contextParts: string[] = [];
  if (t.scenario) contextParts.push(`Setting/Scenario: ${t.scenario}`);
  if (t.creatorNotes) contextParts.push(`Creator's Notes: ${t.creatorNotes}`);
  if ((t.tags ?? []).length > 0) {
    contextParts.push(`Tags: ${t.tags!.join(", ")}`);
  }
  const context = contextParts.join("\n") || "(no additional context)";

  // Build description: use feedback-augmented prompt if retrying
  let description = t.content;
  if (input.feedback) {
    description = [
      "PREVIOUS ATTEMPT:",
      t.content,
      "",
      "USER FEEDBACK — improve the following:",
      input.feedback,
    ].join("\n");
  }

  let content = await provider.generateCharacterSheet(
    { name: t.name, description },
    context,
    input.modules,
    signal
  );

  // Post-process: fill missing canonical sections
  content = ensureAllSections(content);
  return { content };
}

export interface ConvertApplyInput {
  template: CharacterTemplate;
  content: string;
}

/**
 * Apply a generated BL sheet to the record: overwrite content, drop format="ccv2",
 * preserve ccv2Content for "Compare to Original", keep metadata.
 */
export function convertCardApply(input: ConvertApplyInput): Partial<CharacterTemplate> {
  return {
    content: input.content,
    format: undefined,           // drops the "ccv2" literal → becomes BL-native
    ccv2Content: input.template.content,  // cache original for comparison
    summary: "",                 // reset summary — BL-native re-derives it
    // Preserve: name, tags, scenario, creator, cardRef, spec, specVersion, etc.
  };
}