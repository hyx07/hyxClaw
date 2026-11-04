// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageRenderer, extractUserText, parseUserMessageContent } from "./messages.js";

const PERSISTED_WITH_SELECTION = [
  "<系统提示>",
  "当前用户正在浏览文件：knowledge_base/a.md",
  "已选中：第 3 行到第 4 行",
  "选中内容：",
  "```text",
  "第一行",
  "第二行",
  "```",
  "",
  "用户正在浏览的文件不一定与当前对话直接相关，请结合上下文判断是否需要参考。",
  "</系统提示>",
  "用户消息：请分析这段",
].join("\n");

function createRenderer() {
  const state = { messagesEl: document.getElementById("messages") };
  const renderer = createMessageRenderer({
    state,
    streaming: {},
    onRestart: vi.fn(),
    scrollToBottom: vi.fn(),
  });
  return { state, renderer };
}

describe("parseUserMessageContent", () => {
  it("splits the persisted preview context from the user text", () => {
    expect(parseUserMessageContent(PERSISTED_WITH_SELECTION)).toEqual({
      text: "请分析这段",
      previewPath: "knowledge_base/a.md",
      selectionRange: { startLine: 3, endLine: 4 },
      selectedText: "第一行\n第二行",
    });
  });

  it("leaves plain messages untouched", () => {
    expect(parseUserMessageContent("普通消息")).toEqual({
      text: "普通消息",
      previewPath: "",
      selectionRange: null,
      selectedText: "",
    });
  });

  it("keeps the selection when it contains an inner code fence", () => {
    const content = [
      "<系统提示>",
      "当前用户正在浏览文件：inputs/a.md",
      "已选中：第 3 行到第 4 行",
      "选中内容：",
      "```text",
      "```js",
      "const a = 1;",
      "```",
      "```",
      "",
      "用户正在浏览的文件不一定与当前对话直接相关，请结合上下文判断是否需要参考。",
      "</系统提示>",
      "用户消息：解释一下",
    ].join("\n");

    expect(parseUserMessageContent(content).selectedText).toBe("```js\nconst a = 1;\n```");
  });

  it("parses a single-line selection range", () => {
    const content = [
      "<系统提示>",
      "当前用户正在浏览文件：inputs/a.md",
      "已选中：第 12 行",
      "选中内容：",
      "```text",
      "唯一一行",
      "```",
      "",
      "用户正在浏览的文件不一定与当前对话直接相关，请结合上下文判断是否需要参考。",
      "</系统提示>",
      "用户消息：看看这行",
    ].join("\n");

    expect(parseUserMessageContent(content).selectionRange).toEqual({ startLine: 12, endLine: 12 });
  });
});

describe("user message reference", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="messages"></div>';
  });

  it("renders a collapsed reference button parsed from persisted content", async () => {
    const { state, renderer } = createRenderer();
    renderer.appendMessage("user", PERSISTED_WITH_SELECTION, "m1");

    const button = state.messagesEl.querySelector(".message-reference-toggle");
    const panel = state.messagesEl.querySelector(".message-reference-panel");
    expect(button).not.toBeNull();
    expect(state.messagesEl.querySelector(".message-bubble > .message-reference")).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    expect(state.messagesEl.querySelector(".user-message-text, .message-content").textContent).toBe(
      "请分析这段",
    );

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("引用文件：knowledge_base/a.md");
    expect(panel.textContent).toContain("（第 3–4 行）");
    expect(panel.querySelector(".message-reference-text").textContent).toBe("第一行\n第二行");

    button.click();
    expect(panel.hidden).toBe(true);
  });

  it("shows the live selection range on the optimistic bubble", () => {
    const { state, renderer } = createRenderer();
    renderer.appendMessage("user", "问题", undefined, {
      reference: {
        previewPath: "inputs/b.md",
        selectionRange: { startLine: 7, endLine: 8 },
        selectedText: "原文内容",
      },
    });

    const panel = state.messagesEl.querySelector(".message-reference-panel");
    expect(panel.textContent).toContain("引用文件：inputs/b.md");
    expect(panel.textContent).toContain("（第 7–8 行）");
    expect(panel.querySelector(".message-reference-text").textContent).toBe("原文内容");
  });

  it("shows only the file path when nothing is selected", () => {
    const { state, renderer } = createRenderer();
    renderer.appendMessage("user", "总结一下", undefined, {
      reference: { previewPath: "inputs/c.md" },
    });

    const panel = state.messagesEl.querySelector(".message-reference-panel");
    expect(panel.textContent).toContain("引用文件：inputs/c.md");
    expect(panel.textContent).not.toContain("引用文字：");
  });

  it("does not add the button when no preview context was attached", () => {
    const { state, renderer } = createRenderer();
    renderer.appendMessage("user", "普通消息", "m2");

    expect(state.messagesEl.querySelector(".message-reference")).toBeNull();
  });

  it("still gives the restart button the original user text", () => {
    expect(extractUserText(PERSISTED_WITH_SELECTION)).toBe("请分析这段");
  });
});
