import { randomUUID } from "node:crypto";
import type { Config, ProviderName } from "../config/index.js";
import { chatStream } from "../chat/index.js";
import type { UsageRecord } from "../llm/types.js";
import type { getLogger } from "../logger/index.js";
import { loadSession } from "../session/index.js";
import type { Client } from "./protocol.js";
import { sendToClient } from "./send.js";
import { buildAugmentedUserContent } from "./services/chat-content.js";
import { normalizeImageDataUrl } from "../media/image.js";
import { appendUsageRecord } from "./services/usage-store.js";

const WRITE_PERMISSION_TOOLS = new Set(["write", "edit", "delete", "move", "web_search", "web_fetch"]);

export function requiresToolPermission(client: Pick<Client, "writePermOpen">, toolName: string): boolean {
  return WRITE_PERMISSION_TOOLS.has(toolName) && !client.writePermOpen;
}

/** Active AbortControllers for in-flight chat operations, keyed by sessionId. */
const activeChats = new Map<string, AbortController>();

export function cancelChat(sessionId: string, pendingPermissions?: Map<string, (allowed: boolean) => void>): boolean {
  const controller = activeChats.get(sessionId);
  if (controller) {
    controller.abort();
    activeChats.delete(sessionId);
    // Resolve any pending permission promises so checkPermission doesn't hang
    if (pendingPermissions) {
      for (const resolve of pendingPermissions.values()) resolve(false);
      pendingPermissions.clear();
    }
    return true;
  }
  return false;
}

function getModelModal(config: Config, provider: ProviderName, model: string): "l" | "vl" {
  return config.providers[provider]?.models.find((item) => item.id === model)?.modal ?? "l";
}

function buildPermissionDetails(toolName: string, input: Record<string, unknown>): Record<string, string> {
  const str = (value: unknown, max: number) => String(value ?? "").slice(0, max);
  const list = (value: unknown, max: number) => Array.isArray(value)
    ? value.map((item) => String(item)).join("\n").slice(0, max)
    : str(value, max);
  if (toolName === "write") return { path: str(input.path, 200), preview: str(input.content, 100) };
  if (toolName === "edit") return { path: str(input.path, 200), oldPreview: str(input.old_string, 80), newPreview: str(input.new_string, 80) };
  if (toolName === "delete") return { path: str(input.path, 200) };
  if (toolName === "move") return { path: str(input.path, 200), newPath: str(input.new_path, 200) };
  if (toolName === "web_search") return { query: str(input.query, 500) };
  if (toolName === "web_fetch") return { urls: input.url ? str(input.url, 1000) : list(input.urls, 1000) };
  return {};
}

export async function processChatMessage(options: {
  client: Client;
  sessionId: string;
  content: string;
  images?: Array<{ url: string; path?: string }>;
  provider: ProviderName;
  model: string;
  thinkingEffort?: string;
  previewPath?: string;
  selectedPreviewText?: string;
  pendingPermissions: Map<string, (allowed: boolean) => void>;
  config: Config;
  logger: ReturnType<typeof getLogger>;
}): Promise<void> {
  const { client, sessionId, content, images, provider, model, thinkingEffort, previewPath, selectedPreviewText, pendingPermissions, config, logger } = options;
  
  // Abort any existing chat for this session
  cancelChat(sessionId);
  const controller = new AbortController();
  activeChats.set(sessionId, controller);

  try {
    if (images?.length && getModelModal(config, provider, model) !== "vl") {
      sendToClient(client, { type: "error", sessionId, message: "当前模型不支持图片，请切换到视觉模型后再发送" });
      return;
    }

    let normalizedImages = images;
    try {
      normalizedImages = images?.length
        ? await Promise.all(images.map(async (image) => ({ ...image, url: await normalizeImageDataUrl(image.url) })))
        : images;
    } catch (error) {
      sendToClient(client, { type: "error", sessionId, message: (error as Error).message });
      return;
    }
    const userMessageId = randomUUID();
    sendToClient(client, { type: "chatStart", sessionId, userMessageId });
    const { llmUserContent, persistedUserContent } = buildAugmentedUserContent(content, normalizedImages, previewPath, selectedPreviewText);
    let fullResponse = "";
    let usage: UsageRecord | undefined;
    let contextUsage: UsageRecord | undefined;

    for await (const result of chatStream(sessionId, llmUserContent, config, {
      provider,
      model,
      thinkingEffort,
      persistedUserContent,
      userMessageId,
      signal: controller.signal,
      onToolCall: (name, input, callId) => sendToClient(client, { type: "toolCall", sessionId, name, input, callId }),
      onToolResult: (name, resultContent, isError, callId) => sendToClient(client, { type: "toolResult", sessionId, name, content: resultContent, isError, callId }),
      checkPermission: async (toolName, input) => {
        if (!requiresToolPermission(client, toolName)) return true;
        const requestId = randomUUID();
        sendToClient(client, {
          type: "toolPermissionRequest",
          sessionId,
          requestId,
          toolName,
          details: buildPermissionDetails(toolName, input),
        });
        return new Promise<boolean>((resolve) => pendingPermissions.set(requestId, resolve));
      },
    })) {
      if (!result.done) {
        if (result.reasoning) sendToClient(client, { type: "chatReasoning", sessionId, chunk: result.chunk });
        else {
          fullResponse += result.chunk;
          sendToClient(client, { type: "chatChunk", sessionId, chunk: result.chunk });
        }
      } else {
        if (result.cancelled) {
          sendToClient(client, { type: "chatCancelled", sessionId, fullResponse });
          return;
        }
        usage = result.usage;
        contextUsage = result.contextUsage;
      }
    }

    if (usage) await appendUsageRecord(usage);
    const summarize = (record: UsageRecord | undefined) => record ? {
      model: record.model,
      provider: record.provider,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      billingOutputTokens: record.billingOutputTokens,
      thinkingTokens: record.thinkingTokens,
      cachedReadTokens: record.cachedReadTokens,
      cachedWriteTokens: record.cachedWriteTokens,
      cost: record.cost,
    } : undefined;
    sendToClient(client, { type: "chatEnd", sessionId, fullResponse, usage: summarize(usage), contextUsage: summarize(contextUsage) });
    logger.info(`Chat completed: ${(await loadSession(sessionId)).title}`);
  } catch (error) {
    logger.error(`Chat processing error: ${(error as Error).message}`);
    sendToClient(client, { type: "error", sessionId, message: `Chat failed: ${(error as Error).message}` });
  } finally {
    activeChats.delete(sessionId);
  }
}
