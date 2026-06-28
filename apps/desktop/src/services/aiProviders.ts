import type { AIConfig, AIProvider } from "../../../../packages/domain/src/models";

export interface AIProviderPreset {
  value: AIProvider;
  label: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
  modelNote: string;
  /** Helper text under the Base URL field. */
  baseUrlNote: string;
  /** Helper text under the optional Vision Model field. */
  visionNote: string;
  /** Recommended model IDs offered as click-to-fill chips under the Model field. */
  modelSuggestions?: string[];
  /** External provider model/docs reference, linked from the form header. */
  docsUrl?: string;
  keyPlaceholder: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini",
    visionModel: "gpt-5.4-mini",
    modelNote: "Fast, cost-conscious default with structured output and vision.",
    baseUrlNote: "OpenAI's API endpoint. Change it only if you route through a proxy or Azure gateway.",
    visionNote: "Model used for opt-in screenshot analysis. Leave blank to reuse the model above.",
    docsUrl: "https://platform.openai.com/docs/models",
    keyPlaceholder: "sk-..."
  },
  {
    value: "grok",
    label: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.3",
    visionModel: "grok-4.3",
    modelNote: "xAI's recommended general-purpose model, with structured output and vision.",
    baseUrlNote: "xAI's OpenAI-compatible endpoint. The default works for hosted Grok.",
    visionNote: "Model used for opt-in screenshot analysis. Leave blank to reuse the model above.",
    docsUrl: "https://docs.x.ai/docs/models",
    keyPlaceholder: "xai-..."
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    modelNote: "DeepSeek's lower-cost V4 model for text and structured output.",
    baseUrlNote: "DeepSeek's OpenAI-compatible endpoint. The default works for the hosted API.",
    visionNote: "DeepSeek has no vision model — visual context stays unavailable for this provider.",
    docsUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    keyPlaceholder: "sk-..."
  },
  {
    value: "claude",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    visionModel: "claude-sonnet-4-6",
    modelNote: "Anthropic's balanced default for speed, intelligence, and vision.",
    baseUrlNote: "Anthropic's API endpoint. Change it only if you route through a proxy or gateway.",
    visionNote: "Model used for opt-in screenshot analysis. Leave blank to reuse the model above.",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    keyPlaceholder: "sk-ant-..."
  },
  {
    value: "custom",
    label: "Custom / OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    modelNote: "Enter a model ID supported by your OpenAI-compatible endpoint.",
    baseUrlNote: "Your endpoint's base URL, including the version path (e.g. /v1) if it needs one.",
    visionNote: "Optional vision-capable model ID, if your endpoint accepts image input.",
    keyPlaceholder: "API key"
  }
];

export function getAIProviderPreset(provider: AIProvider): AIProviderPreset {
  return AI_PROVIDER_PRESETS.find((preset) => preset.value === provider) ?? AI_PROVIDER_PRESETS[0];
}

export function createDefaultAIConfig(provider: AIProvider = "openai"): AIConfig {
  const preset = getAIProviderPreset(provider);
  return {
    provider,
    apiKey: "",
    baseUrl: preset.baseUrl,
    model: preset.model,
    visionModel: preset.visionModel
  };
}

const RETIRED_APP_DEFAULTS: Partial<Record<AIProvider, Record<string, string>>> = {
  openai: { "gpt-4o": "gpt-5.4-mini" },
  grok: { "grok-2-1212": "grok-4.3" },
  deepseek: {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-flash"
  },
  claude: { "claude-3-5-sonnet-20241022": "claude-sonnet-4-6" }
};

export function upgradeRetiredAppDefault(config: AIConfig): AIConfig {
  const replacement = RETIRED_APP_DEFAULTS[config.provider]?.[config.model];
  if (!replacement) return config;

  const preset = getAIProviderPreset(config.provider);
  return {
    ...config,
    model: replacement,
    visionModel:
      !config.visionModel || config.visionModel === config.model
        ? preset.visionModel
        : config.visionModel
  };
}
