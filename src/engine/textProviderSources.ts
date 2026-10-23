export const DEFAULT_PROVIDER_TEST_PROMPT =
  "Reply with a short greeting and confirm you are online.";

export type TextProviderSource =
  | "openai"
  | "openai_compatible"
  | "deepseek"
  | "openrouter"
  | "moonshot";

export const TEXT_PROVIDER_SOURCE_IDS: readonly TextProviderSource[] = [
  "openai_compatible",
  "openrouter",
  "deepseek",
  "moonshot",
  "openai",
] as const;

export type OptionalTextSamplerKey =
  | "topP"
  | "topK"
  | "minP"
  | "topA"
  | "frequencyPenalty"
  | "presencePenalty"
  | "repetitionPenalty";

export type TextSamplingParamKey = "temperature" | OptionalTextSamplerKey;

export interface TextSamplingParamSpec {
  key: TextSamplingParamKey;
  wireKey: string;
  label: string;
  rangeHint: string;
  description: string;
  min: number;
  max: number;
  /** Upper bound for the range slider track when the numeric input allows higher values (e.g. Top K). */
  sliderMax?: number;
  step: number;
  /** Resting position of the slider thumb when an optional parameter is unset ("Default"). */
  defaultPreview: number;
  integer?: boolean;
}

export const TEXT_SAMPLING_PARAMS: Record<TextSamplingParamKey, TextSamplingParamSpec> = {
  temperature: {
    key: "temperature",
    wireKey: "temperature",
    label: "Temperature",
    rangeHint: "0–2",
    description: "Controls randomness. Higher values produce more creative responses; lower values are more deterministic.",
    min: 0,
    max: 2,
    step: 0.05,
    defaultPreview: 0.8,
  },
  topP: {
    key: "topP",
    wireKey: "top_p",
    label: "Top P",
    rangeHint: "0–1",
    description: "Nucleus sampling: considers only tokens comprising the top P probability mass.",
    min: 0,
    max: 1,
    step: 0.01,
    defaultPreview: 1,
  },
  topK: {
    key: "topK",
    wireKey: "top_k",
    label: "Top K",
    rangeHint: "≥1",
    description: "Limits sampling to the K most likely next tokens.",
    min: 1,
    max: 1000,
    sliderMax: 100,
    step: 1,
    defaultPreview: 40,
    integer: true,
  },
  minP: {
    key: "minP",
    wireKey: "min_p",
    label: "Min P",
    rangeHint: "0–1",
    description: "Minimum probability threshold scaled relative to the most likely token.",
    min: 0,
    max: 1,
    step: 0.01,
    defaultPreview: 0.05,
  },
  topA: {
    key: "topA",
    wireKey: "top_a",
    label: "Top A",
    rangeHint: "0–1",
    description: "Dynamic probability threshold proportional to the squared probability of the top token.",
    min: 0,
    max: 1,
    step: 0.01,
    defaultPreview: 0,
  },
  frequencyPenalty: {
    key: "frequencyPenalty",
    wireKey: "frequency_penalty",
    label: "Frequency Penalty",
    rangeHint: "-2–2",
    description: "Penalizes tokens based on their existing frequency in the generated text.",
    min: -2,
    max: 2,
    step: 0.05,
    defaultPreview: 0,
  },
  presencePenalty: {
    key: "presencePenalty",
    wireKey: "presence_penalty",
    label: "Presence Penalty",
    rangeHint: "-2–2",
    description: "Penalizes tokens based on whether they have appeared in the generated text so far.",
    min: -2,
    max: 2,
    step: 0.05,
    defaultPreview: 0,
  },
  repetitionPenalty: {
    key: "repetitionPenalty",
    wireKey: "repetition_penalty",
    label: "Repetition Penalty",
    rangeHint: "0–3",
    description: "Multiplicative penalty applied to tokens that have already appeared (1.0 = no penalty).",
    min: 0,
    max: 3,
    sliderMax: 2,
    step: 0.01,
    defaultPreview: 1,
  },
};

export const OPTIONAL_TEXT_SAMPLER_KEYS: readonly OptionalTextSamplerKey[] = [
  "topP",
  "topK",
  "minP",
  "topA",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
] as const;

export interface TextProviderSourceSpec {
  id: TextProviderSource;
  label: string;
  shortLabel: string;
  defaultBaseUrl: string;
  baseUrlPlaceholder: string;
  modelPlaceholder: string;
  description: string;
  supportedParams: readonly TextSamplingParamKey[];
  paramOverrides?: Partial<
    Record<
      TextSamplingParamKey,
      Partial<Pick<TextSamplingParamSpec, "min" | "max" | "sliderMax" | "step" | "defaultPreview" | "rangeHint">>
    >
  >;
}

export const TEXT_PROVIDER_SOURCES: Record<TextProviderSource, TextProviderSourceSpec> = {
  openai_compatible: {
    id: "openai_compatible",
    label: "OpenAI Compatible",
    shortLabel: "Compatible",
    defaultBaseUrl: "",
    baseUrlPlaceholder: "http://localhost:1234/v1",
    modelPlaceholder: "e.g. llama-3.3-70b-instruct",
    description:
      "Local servers (LM Studio, llama.cpp, KoboldCpp, vLLM, TabbyAPI, Ollama) and custom OpenAI-compatible endpoints.",
    supportedParams: [
      "temperature",
      "topP",
      "topK",
      "minP",
      "topA",
      "frequencyPenalty",
      "presencePenalty",
      "repetitionPenalty",
    ],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    baseUrlPlaceholder: "https://openrouter.ai/api/v1",
    modelPlaceholder: "e.g. anthropic/claude-3.7-sonnet",
    description:
      "OpenRouter unified Chat Completions API with extended samplers and automatic model context discovery.",
    supportedParams: [
      "temperature",
      "topP",
      "topK",
      "minP",
      "topA",
      "frequencyPenalty",
      "presencePenalty",
      "repetitionPenalty",
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    baseUrlPlaceholder: "https://api.deepseek.com/v1",
    modelPlaceholder: "e.g. deepseek-chat, deepseek-reasoner",
    description:
      "Official DeepSeek Chat Completions API. Extended local samplers (Top K, Min P, Top A, Rep Penalty) are omitted.",
    supportedParams: ["temperature", "topP", "frequencyPenalty", "presencePenalty"],
  },
  moonshot: {
    id: "moonshot",
    label: "Moonshot AI",
    shortLabel: "Moonshot AI",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    baseUrlPlaceholder: "https://api.moonshot.ai/v1",
    modelPlaceholder: "e.g. kimi-k2-0711-preview, moonshot-v1-128k",
    description:
      "Official Moonshot AI (Kimi) API. Temperature is bounded to 0–1; use .cn/v1 in Base URL for China mainland keys.",
    supportedParams: ["temperature", "topP", "frequencyPenalty", "presencePenalty"],
    paramOverrides: {
      temperature: {
        min: 0,
        max: 1,
        step: 0.05,
        defaultPreview: 0.6,
        rangeHint: "0–1",
      },
    },
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "e.g. gpt-4o",
    description:
      "Official OpenAI Chat Completions API. Supports standard OpenAI sampling and penalty parameters.",
    supportedParams: ["temperature", "topP", "frequencyPenalty", "presencePenalty"],
  },
};

export const TEXT_PROVIDER_SOURCE_LIST: readonly TextProviderSourceSpec[] =
  TEXT_PROVIDER_SOURCE_IDS.map((id) => TEXT_PROVIDER_SOURCES[id]);

/** Resolve the effective parameter spec for a given source (applying any per-source bounds like Moonshot's 0–1 temperature). */
export function getSourceParamSpec(
  source: TextProviderSource,
  paramKey: TextSamplingParamKey
): TextSamplingParamSpec {
  const base = TEXT_SAMPLING_PARAMS[paramKey];
  const override = TEXT_PROVIDER_SOURCES[source]?.paramOverrides?.[paramKey];
  return override ? { ...base, ...override } : base;
}

/** Whether a given source supports a specific sampling parameter on the wire. */
export function isParamSupportedBySource(
  source: TextProviderSource,
  paramKey: TextSamplingParamKey
): boolean {
  return TEXT_PROVIDER_SOURCES[source].supportedParams.includes(paramKey);
}

/** Infer the Chat Completion Source from an explicit field or, for legacy connections, from the Base URL. */
export function resolveTextProviderSource(
  explicit?: TextProviderSource | null,
  baseUrl?: string | null
): TextProviderSource {
  if (explicit && explicit in TEXT_PROVIDER_SOURCES) {
    return explicit;
  }
  const normalized = (baseUrl ?? "").trim().toLowerCase();
  if (normalized.includes("openrouter.ai")) return "openrouter";
  if (normalized.includes("api.deepseek.com")) return "deepseek";
  if (normalized.includes("api.moonshot.ai") || normalized.includes("api.moonshot.cn")) return "moonshot";
  if (normalized.includes("api.openai.com")) return "openai";
  return "openai_compatible";
}

/** True when a Base URL is empty or matches one of the built-in cloud default URLs (including Moonshot .cn). */
export function isBuiltInCloudBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if (!trimmed) return true;
  const knownDefaults = [
    "https://api.openai.com/v1",
    "https://api.openai.com",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com",
    "https://openrouter.ai/api/v1",
    "https://openrouter.ai/api",
    "https://api.moonshot.ai/v1",
    "https://api.moonshot.ai",
    "https://api.moonshot.cn/v1",
    "https://api.moonshot.cn",
  ];
  return knownDefaults.includes(trimmed);
}
