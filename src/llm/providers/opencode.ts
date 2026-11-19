/**
 * OpenCode Console LLM provider（PAYG / Go 共用实现）
 *
 * OpenAI Chat Completions 风格 API（https://opencode.ai/docs/console/harnesses#base-urls）：
 *   - PAYG: https://opencode.ai/inference/openai/v1        （按 workspace 余额计费）
 *   - Go:   https://opencode.ai/inference/go/openai/v1     （需 Go 订阅）
 * 两者仅 baseUrl 前缀不同，请求/响应结构一致。
 *
 * Go 的两条硬性要求（https://opencode.ai/docs/console/go#where-can-i-use-it）：
 *   - User-Agent 必须是自己的 client 名（如 hyxClaw/x.y.z），不能是通用 HTTP 库名
 *   - 每个会话发送稳定的 x-opencode-session 头（Go 缺头直接 400 MissingSessionID）
 *
 * thinking 按模型在 config.json 配置（2026-11 实测，PAYG 端点）：
 *   - deepseek-v4.1-flash：reasoning_effort（off/low/high/max 均有效）；enable_thinking 无效
 *   - glm-5.3-flash：reasoning_effort（low/high/max）+ thinking:{type:"disabled"} 关闭；
 *     reasoning_effort:"off" 返回 400
 *   - glm-5.3：强制思考，thinking.disabled / reasoning_effort:"off" 均 400，不可关闭
 *
 * usage：标准 OpenAI 结构 + opencode 附加层：
 *   - completion_tokens 含 thinking token，需扣减 reasoning_tokens
 *   - opencode.tokens.cache_write_5m / cache_write_1h 映射缓存写入
 *   - usage.cost 是服务端实算费用（美元），可作对账参考，项目内费用仍按 config 计算
 */

import { createRequire } from "node:module";
import type { Message } from "../../types/index.js";
import { LLMError } from "../../errors/index.js";
import { logger } from "../../logger/index.js";
import type { LLMToolCall } from "../../tools/types.js";
import type {
  LLMProvider,
  CompletionResponse,
  CompletionOptions,
  StreamChunk,
  StreamFinish,
  NormalizedUsage,
} from "../types.js";
import { DEFAULT_TIMEOUT, mapMessage, fetchWithRetry } from "./shared.js";

export const OPENCODE_ENDPOINT = "https://opencode.ai/inference/openai/v1";

/** Go 订阅端点：仅前缀不同，在 config.json 把 baseUrl 换成它即可 */
export const OPENCODE_GO_ENDPOINT = "https://opencode.ai/inference/go/openai/v1";

export const OPENCODE_DEFAULT_MODEL = "deepseek-v4.1-flash";

export const OPENCODE_SESSION_HEADER = "x-opencode-session";

/** Go 要求用自己的 client 名，不用通用 HTTP 库名；版本号从 package.json 读取 */
const require = createRequire(import.meta.url);
const pkgVersion = (require("../../../package.json") as { version?: string }).version ?? "0.0.0";
export const OPENCODE_USER_AGENT = `hyxClaw/${pkgVersion}`;

/** 缺 sessionId 时的兜底：进程内稳定，保证 Go 端点每个请求都带会话头 */
const fallbackSessionId = `ses_hyxclaw_${crypto.randomUUID()}`;

export function buildOpenCodeHeaders(apiKey: string, sessionId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": OPENCODE_USER_AGENT,
    [OPENCODE_SESSION_HEADER]: sessionId ?? fallbackSessionId,
  };
}

function mapUsage(raw: OpenCodeRawUsage): NormalizedUsage {
  const thinkingTokens = raw.completion_tokens_details?.reasoning_tokens ?? 0;
  const promptDetails = raw.prompt_tokens_details;
  const opencodeTokens = raw.opencode?.tokens;
  const cachedWrite =
    opencodeTokens === undefined
      ? undefined
      : (opencodeTokens.cache_write_5m ?? 0) + (opencodeTokens.cache_write_1h ?? 0);
  return {
    inputTokens: raw.prompt_tokens,
    outputTokens: Math.max(0, raw.completion_tokens - thinkingTokens),
    billingOutputTokens: raw.completion_tokens,
    thinkingTokens: thinkingTokens > 0 ? thinkingTokens : undefined,
    cachedReadTokens: promptDetails?.cached_tokens ?? promptDetails?.cache_read_input_tokens ?? opencodeTokens?.cache_read,
    cachedWriteTokens: cachedWrite,
  };
}

interface OpenCodeRawUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_read_input_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  opencode?: {
    billing_source?: string;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache_read?: number;
      cache_write_5m?: number;
      cache_write_1h?: number;
    };
  };
}

interface OpenCodeChunk {
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      /** 思考字段名不保证统一，三字段兼容（与 commandcode 同策略） */
      reasoning_content?: string | null;
      reasoning?: string | null;
      reasoning_text?: string | null;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason: string | null;
  }>;
  usage?: OpenCodeRawUsage | null;
}

interface OpenCodeResponse {
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: LLMToolCall[];
      reasoning_content?: string;
      reasoning?: string;
      reasoning_text?: string;
    };
    finish_reason: string;
  }>;
  usage?: OpenCodeRawUsage | null;
}

/** 思考字段兼容：网关背后各模型原生实现不同 */
function pickReasoning(...candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    if (c) return c;
  }
  return undefined;
}

export class OpenCodeProvider implements LLMProvider {
  readonly label = "opencode";

  async complete(apiKey: string, messages: Message[], options: CompletionOptions = {}): Promise<CompletionResponse> {
    const {
      model = OPENCODE_DEFAULT_MODEL,
      baseUrl = OPENCODE_ENDPOINT,
      maxTokens = 4096,
      timeout = DEFAULT_TIMEOUT,
      tools,
      thinkingParams,
      responseFormat,
      sessionId,
    } = options;

    const body = {
      model,
      messages: messages.map(mapMessage),
      max_tokens: maxTokens,
      stream: false,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...thinkingParams,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    };

    const res = await fetchWithRetry(
      this.label,
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: buildOpenCodeHeaders(apiKey, sessionId),
        body: JSON.stringify(body),
      },
      timeout,
    );

    const data = (await res.json()) as OpenCodeResponse;
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
      finish_reason: choice.finish_reason,
      reasoning_content: pickReasoning(
        choice.message.reasoning_content,
        choice.message.reasoning,
        choice.message.reasoning_text,
      ),
      usage: data.usage ? mapUsage(data.usage) : undefined,
    };
  }

  async *stream(
    apiKey: string,
    messages: Message[],
    options: CompletionOptions = {},
  ): AsyncGenerator<StreamChunk, StreamFinish, unknown> {
    const {
      model = OPENCODE_DEFAULT_MODEL,
      baseUrl = OPENCODE_ENDPOINT,
      maxTokens = 4096,
      timeout = DEFAULT_TIMEOUT,
      tools,
      thinkingParams,
      sessionId,
    } = options;

    const body = {
      model,
      messages: messages.map(mapMessage),
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...thinkingParams,
    };

    const res = await fetchWithRetry(
      this.label,
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: buildOpenCodeHeaders(apiKey, sessionId),
        body: JSON.stringify(body),
      },
      timeout,
      options.signal,
    );

    if (!res.body) throw new LLMError("响应 body 为空", { code: "llm_empty_response" });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finishReason = "";
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (options.signal?.aborted) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const data = t.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as OpenCodeChunk;
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            const reasoningText = pickReasoning(delta?.reasoning_content, delta?.reasoning, delta?.reasoning_text);
            if (reasoningText) yield { type: "reasoning", text: reasoningText };
            if (delta?.content) yield { type: "content", text: delta.content };
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsMap.get(tc.index) ?? { id: "", name: "", arguments: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                toolCallsMap.set(tc.index, existing);
                yield {
                  type: "toolCallDelta",
                  index: tc.index,
                  id: tc.id,
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                };
              }
            }
            if (parsed.usage) yield { type: "usage", usage: mapUsage(parsed.usage) };
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }
          } catch {
            logger.warn("[opencode] 无法解析 chunk");
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const tool_calls: LLMToolCall[] = [...toolCallsMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

    return { finish_reason: finishReason || "stop", ...(tool_calls.length > 0 ? { tool_calls } : {}) };
  }
}
