import type { CharacterFormat, CharacterTemplate, PromptPresetModule } from "../../schemas";
import { ensureAllSections, resolveCharacterFormat } from "../../engine/characterFormat";
import type { TurnProvider } from "../provider";

export interface ConvertGenerateInput {
  template: CharacterTemplate;
  feedback?: string;
  currentContent?: string;
  modules?: PromptPresetModule[];
  /** Target character format for the converted sheet (defaults to the shipped
   *  Default format when omitted). */
  format?: CharacterFormat;
}

export interface ConvertGenerateOutput {
  content: string;
}

/**
 * Generate or refine a BL-format character sheet from a CCv2 card.
 * Calls the AI provider's generateCharacterSheet (for initial conversion)
 * or refineCharacterSheet (for targeted feedback retries).
 */
export async function convertCardGenerate(
  provider: TurnProvider,
  input: ConvertGenerateInput,
  signal?: AbortSignal
): Promise<ConvertGenerateOutput> {
  const t = input.template;
  const fmt = resolveCharacterFormat(input.format);

  // Build story context from card metadata
  const contextParts: string[] = [];
  if (t.scenario) contextParts.push(`Setting/Scenario: ${t.scenario}`);
  if (t.creatorNotes) contextParts.push(`Creator's Notes: ${t.creatorNotes}`);
  if ((t.tags ?? []).length > 0) {
    contextParts.push(`Tags: ${t.tags!.join(", ")}`);
  }
  const context = contextParts.join("\n") || "(no additional context)";

  let content: string;

  // If retrying with feedback and an existing draft, perform targeted refinement
  if (input.feedback && input.currentContent) {
    content = await provider.refineCharacterSheet(
      input.currentContent,
      t.content,
      input.feedback,
      context,
      signal,
      fmt
    );
  } else {
    // Initial generation from source CCv2 card
    content = await provider.generateCharacterSheet(
      { name: t.name, description: t.content },
      context,
      signal,
      fmt
    );
  }

  // Post-process: fill missing sections per the target format
  content = ensureAllSections(content, fmt);
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
    ccv2CreatorNotes: input.template.creatorNotes, // cache original creator notes for comparison
    ccv2Tags: input.template.tags,        // cache original tags for comparison / restoration
    summary: "",                 // reset summary — BL-native re-derives it
    // Preserve: name, tags, scenario, creator, cardRef, spec, specVersion, etc.
  };
}