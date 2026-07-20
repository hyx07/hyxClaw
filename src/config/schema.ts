/**
 * Config schema validation using Zod
 */

import { z } from "zod";

export const SUPPORTED_PROVIDERS = ["zai", "dashscope", "deepseek"] as const;
export const THINKING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
export const TAVILY_SEARCH_DEPTHS = ["basic", "advanced", "fast", "ultra-fast"] as const;
export const TAVILY_FETCH_DEPTHS = ["basic", "advanced"] as const;
export const TAVILY_FETCH_FORMATS = ["markdown", "text"] as const;

export const ProviderNameSchema = z.enum(SUPPORTED_PROVIDERS);
export const ThinkingEffortSchema = z.enum(THINKING_EFFORTS);
export const TavilySearchDepthSchema = z.enum(TAVILY_SEARCH_DEPTHS);
export const TavilyFetchDepthSchema = z.enum(TAVILY_FETCH_DEPTHS);
export const TavilyFetchFormatSchema = z.enum(TAVILY_FETCH_FORMATS);

export const ThinkingParamsSchema = z.record(z.string(), z.unknown());

export const ThinkingOptionSchema = z.object({
  id: z.string().min(1).refine((value) => value !== "none", {
    message: "'none' is added by the system and must not be configured on a model",
  }),
  label: z.string().min(1).optional(),
  params: ThinkingParamsSchema,
});

export const CostConfigSchema = z.object({
  input: z.number().min(0).default(0),
  output: z.number().min(0).default(0),
  cachedRead: z.number().min(0).default(0),
  cachedWrite: z.number().min(0).default(0),
});

export const ModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  modal: z.enum(["l", "vl"]).optional(),
  thinking: z.array(ThinkingOptionSchema).optional(),
  thinkingOff: ThinkingParamsSchema.optional(),
  cost: CostConfigSchema.optional(),
});

export const ProviderCredentialSchema = z.object({
  apiKey: z.string().default(""),
  baseUrl: z.string().url().optional(),
  models: z.array(ModelOptionSchema).min(1),
});

export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default("127.0.0.1"),
});

export const FSConfigSchema = z.object({
  allowedDirs: z.array(z.string()).default(["inputs", "knowledge_base", "files"]),
  allowedFiles: z.array(z.string()).default([]),
});

export const DEFAULT_TAVILY_TOOL_CONFIG = {
  enabled: false,
  apiKey: "",
  baseUrl: "https://api.tavily.com",
  searchDepth: "basic" as const,
  maxResults: 10,
  includeAnswer: false,
  includeRawContent: false,
  includeUsage: false,
  timeoutMs: 30_000,
  maxSearchContentChars: 2000,
  fetchDepth: "basic" as const,
  fetchFormat: "markdown" as const,
  maxFetchedChars: 20_000,
};

export const DEFAULT_TOOLS_CONFIG = {
  tavily: DEFAULT_TAVILY_TOOL_CONFIG,
};

export const CompactionConfigSchema = z.object({
  provider: ProviderNameSchema.default("zai"),
  model: z.string().min(1).default("glm-4.5-air"),
  thinkingEffort: ThinkingEffortSchema.default("none"),
  keepRecentRounds: z.number().int().min(0).max(10).default(0),
});

export const TavilyToolConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().default(""),
  baseUrl: z.string().url().default("https://api.tavily.com"),
  searchDepth: TavilySearchDepthSchema.default("basic"),
  maxResults: z.number().int().min(1).max(10).default(10),
  includeAnswer: z.boolean().default(false),
  includeRawContent: z.boolean().default(false),
  includeUsage: z.boolean().default(false),
  timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  maxSearchContentChars: z.number().int().min(100).max(20_000).default(2000),
  fetchDepth: TavilyFetchDepthSchema.default("basic"),
  fetchFormat: TavilyFetchFormatSchema.default("markdown"),
  maxFetchedChars: z.number().int().min(1000).max(200_000).default(20_000),
});

export const ToolsConfigSchema = z.object({
  tavily: TavilyToolConfigSchema.default(DEFAULT_TAVILY_TOOL_CONFIG),
});

export const DEFAULT_SERVER_CONFIG = {
  port: 3000,
  host: "127.0.0.1",
} as const;

export const DEFAULT_FS_CONFIG = {
  allowedDirs: ["inputs", "knowledge_base", "files"],
  allowedFiles: [],
};

export const DEFAULT_CONFIG = {
  providers: {
    zai: {
      apiKey: "",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      models: [
        { id: "GLM-4.5-Air", label: "GLM-4.5-Air" },
        { id: "GLM-4.7", label: "GLM-4.7" },
        { id: "GLM-5.1", label: "GLM-5.1" },
      ],
    },
    dashscope: {
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      models: [
        { id: "qwen3.6-27b", label: "qwen3.6-27b" },
        { id: "qwen3.6-flash", label: "qwen3.6-flash" },
        { id: "qwen3.6-plus", label: "qwen3.6-plus" },
        { id: "qwen-vl-max-latest", label: "qwen-vl-max-latest", modal: "vl" as const },
        { id: "qwen-vl-plus-latest", label: "qwen-vl-plus-latest", modal: "vl" as const },
      ],
    },
    deepseek: {
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      models: [
        { id: "deepseek-v4-flash", label: "v4-flash" },
        { id: "deepseek-v4-pro", label: "v4-pro" },
      ],
    },
  },
  defaultProvider: "zai" as const,
  defaultModel: "GLM-4.7",
  defaultThinkingEffort: "high" as const,
  maxTokens: 4096,
  contextMaxTokens: 100_000,
  contextMaxMessages: 0,
  maxToolCalls: 10,
  server: DEFAULT_SERVER_CONFIG,
  fs: DEFAULT_FS_CONFIG,
  tools: DEFAULT_TOOLS_CONFIG,
  compaction: {
    provider: "zai" as const,
    model: "glm-4.5-air",
    thinkingEffort: "none" as const,
    keepRecentRounds: 0,
  },
};

export const ConfigSchema = z.object({
  providers: z.record(ProviderNameSchema, ProviderCredentialSchema).default(DEFAULT_CONFIG.providers),
  defaultProvider: ProviderNameSchema.default(DEFAULT_CONFIG.defaultProvider),
  defaultModel: z.string().min(1).default(DEFAULT_CONFIG.defaultModel),
  defaultThinkingEffort: ThinkingEffortSchema.default(DEFAULT_CONFIG.defaultThinkingEffort),
  maxTokens: z.number().int().min(1).default(DEFAULT_CONFIG.maxTokens),
  contextMaxTokens: z.number().int().min(1000).default(DEFAULT_CONFIG.contextMaxTokens),
  contextMaxMessages: z.number().int().min(0).default(DEFAULT_CONFIG.contextMaxMessages),
  maxToolCalls: z.number().int().min(1).default(DEFAULT_CONFIG.maxToolCalls),
  server: ServerConfigSchema.optional().default(DEFAULT_CONFIG.server),
  fs: FSConfigSchema.optional().default(DEFAULT_CONFIG.fs),
  tools: ToolsConfigSchema.optional().default(DEFAULT_CONFIG.tools),
  compaction: CompactionConfigSchema.default(DEFAULT_CONFIG.compaction),
}).superRefine((config, ctx) => {
  const defaultModels = config.providers[config.defaultProvider]?.models ?? [];
  if (!defaultModels.some((model) => model.id === config.defaultModel)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["defaultModel"],
      message: `defaultModel must belong to provider '${config.defaultProvider}'`,
    });
  }
});

export type Config = z.infer<typeof ConfigSchema>;
export type CostConfig = z.infer<typeof CostConfigSchema>;
export type ProviderName = z.infer<typeof ProviderNameSchema>;
export type ThinkingEffort = z.infer<typeof ThinkingEffortSchema>;
export type ModelOption = z.infer<typeof ModelOptionSchema>;
export type ThinkingOption = z.infer<typeof ThinkingOptionSchema>;
export type ThinkingParams = z.infer<typeof ThinkingParamsSchema>;
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type FSConfig = z.infer<typeof FSConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type TavilyToolConfig = z.infer<typeof TavilyToolConfigSchema>;
export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;
