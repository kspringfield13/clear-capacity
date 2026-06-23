import type { AIConfig, AIProvider } from "../../../../packages/domain/src/models";

export interface AIProviderPreset {
  value: AIProvider;
  label: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
  modelNote: string;
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
    keyPlaceholder: "sk-..."
  },
  {
    value: "grok",
    label: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.3",
    visionModel: "grok-4.3",
    modelNote: "xAI's recommended general-purpose model, with structured output and vision.",
    keyPlaceholder: "xai-..."
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    modelNote: "DeepSeek's lower-cost V4 model for text and structured output.",
    keyPlaceholder: "sk-..."
  },
  {
    value: "claude",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    visionModel: "claude-sonnet-4-6",
    modelNote: "Anthropic's balanced default for speed, intelligence, and vision.",
    keyPlaceholder: "sk-ant-..."
  },
  {
    value: "custom",
    label: "Custom / OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    modelNote: "Enter a model ID supported by your OpenAI-compatible endpoint.",
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
