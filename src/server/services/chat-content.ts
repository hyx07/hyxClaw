import type { MessageContentPart } from "../../types/index.js";

/** 选中文本在源文件中的行号范围（1-based，闭区间）。 */
export type SelectionRange = { startLine: number; endLine: number };

function buildUserContent(
  content: string,
  images?: Array<{ url: string; path?: string }>,
): string | MessageContentPart[] {
  if (!images?.length) return content;
  const parts: MessageContentPart[] = [];
  if (content) parts.push({ type: "text", text: content });
  for (const image of images) {
    parts.push({
      type: "image_url",
      image_url: { url: image.url, ...(image.path ? { path: image.path } : {}) },
    });
  }
  return parts;
}

/** 行号范围渲染成元信息区的一行；缺失或非法时返回空串（此时不写这一行）。 */
function formatSelectionRangeLine(range?: SelectionRange): string {
  const start = Number(range?.startLine);
  const end = Number(range?.endLine);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return "";
  return start === end ? `已选中：第 ${start} 行` : `已选中：第 ${start} 行到第 ${end} 行`;
}

/**
 * 文件上下文的统一排版处（只此一处）：
 *
 * ```text
 * <系统提示>
 * 当前用户正在浏览文件：research/a.md
 * 已选中：第 12 行到第 20 行
 * 选中内容：
 * ```text
 * <原文，逐字，不含任何行号头>
 * ```
 *
 * 用户正在浏览的文件不一定与当前对话直接相关，请结合上下文判断是否需要参考。
 * </系统提示>
 * ```
 *
 * 行号属于元信息，放在围栏外，且不空行隔开、紧贴「选中内容：」，
 * 让「选中哪段」与「选中什么」读成一句话；围栏内只放可逐字复现的原文。
 */
export function buildPreviewContextSuffix(
  previewPath?: string,
  selectionRange?: SelectionRange,
  selectedText?: string,
): string {
  const trimmedPath = String(previewPath || "").trim();
  const trimmedSelection = String(selectedText || "").trim();
  if (!trimmedPath && !trimmedSelection) return "";

  const rangeLine = trimmedSelection ? formatSelectionRangeLine(selectionRange) : "";
  const lines = ["<系统提示>"];
  if (trimmedPath) lines.push(`当前用户正在浏览文件：${trimmedPath}`);
  if (rangeLine) lines.push(rangeLine);
  if (trimmedSelection) {
    lines.push("选中内容：", "```text", trimmedSelection, "```");
  }
  lines.push("", "用户正在浏览的文件不一定与当前对话直接相关，请结合上下文判断是否需要参考。", "</系统提示>");
  return lines.join("\n");
}

export function buildAugmentedUserContent(
  content: string,
  images: Array<{ url: string; path?: string }> | undefined,
  previewPath?: string,
  selectionRange?: SelectionRange,
  selectedText?: string,
): {
  llmUserContent: string | MessageContentPart[];
  persistedUserContent: string | MessageContentPart[];
  latestUserTextForLog: string;
} {
  const suffix = buildPreviewContextSuffix(previewPath, selectionRange, selectedText);
  const augmentedText = suffix ? `${suffix}\n用户消息：${content}` : content;
  const llmUserContent = buildUserContent(augmentedText, images);
  return { llmUserContent, persistedUserContent: llmUserContent, latestUserTextForLog: augmentedText };
}
