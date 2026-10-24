/**
 * 生成速度显示（composer 工具栏 #speed-display）：
 * - chatSpeed 事件更新显示、格式化；
 * - 非当前会话的 chatSpeed 进缓存队列，不触碰当前显示；
 * - chatEnd 用真实 outputTokens 显示精确平均；
 * - 取消即清除；静默超时淡化（speed-stale）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../api.js", () => ({
  requestJson: vi.fn(),
  jsonRequest: (method, body) => ({ method, body: JSON.stringify(body) }),
}));

import { createChatFeature } from "./chat.js";
import { createAppState } from "../state.js";

function installFakeDocument() {
  const elements = new Map();
  const makeElement = (id) => ({
    id,
    disabled: false,
    value: "0",
    options: [],
    textContent: "",
    style: {},
    focus: vi.fn(),
    setAttribute: vi.fn(),
    classList: {
      _set: new Set(),
      add(...names) {
        names.forEach((n) => this._set.add(n));
      },
      remove(...names) {
        names.forEach((n) => this._set.delete(n));
      },
      toggle(name, force) {
        const has = this._set.has(name);
        const next = force === undefined ? !has : force;
        if (next) this._set.add(name);
        else this._set.delete(name);
        return next;
      },
      contains: (n) => elements.get(id)?.classList._set.has(n) ?? false,
    },
    addEventListener: vi.fn(),
    remove: vi.fn(),
  });
  globalThis.document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement: () => makeElement("created"),
    addEventListener: vi.fn(),
  };
  return elements;
}

function createHarness() {
  const state = createAppState();
  state.currentSessionId = "s1";
  state.isStreaming = true;
  state.currentRunId = "run-1";
  state.lastStreamSequence = 0;

  const chat = createChatFeature({
    state,
    socket: { send: vi.fn() },
    renderer: { appendMessage: vi.fn(), renderMessages: vi.fn() },
    streaming: { appendTypingDots: vi.fn(), removeTypingDots: vi.fn(), finishStreaming: vi.fn() },
    pickers: { renderPendingImages: vi.fn() },
    permissions: { hideActive: vi.fn(), showForSession: vi.fn(), clearForSession: vi.fn() },
    documents: {},
    actions: {
      refreshSessionSummary: vi.fn(async () => {}),
      refreshRecentModels: vi.fn(async () => {}),
      syncCompactButton: vi.fn(),
      showError: vi.fn(),
    },
  });
  return { state, chat };
}

function speedMessage(sequence, tokensPerSecond, sessionId = "s1", overrides = {}) {
  return {
    type: "chatSpeed",
    sessionId,
    runId: "run-1",
    sequence,
    tokensPerSecond,
    totalTokens: 100,
    elapsedMs: 5000,
    ts: Date.now(),
    ...overrides,
  };
}

describe("chatSpeed 速度显示", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFakeDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("chatSpeed 更新当前会话的速度显示（含格式化）", () => {
    const { state, chat } = createHarness();
    state.speedDisplayEl = document.getElementById("speed-display");

    chat.handleServerMessage(speedMessage(1, 18.44));
    expect(state.speedDisplayEl.textContent).toBe("18.4 tok/s");

    chat.handleServerMessage(speedMessage(2, 123.6));
    expect(state.speedDisplayEl.textContent).toBe("124 tok/s");
    expect(state.speedDisplayEl.classList.contains("speed-stale")).toBe(false);
  });

  it("非当前会话的 chatSpeed 进缓存队列，不触碰当前显示", () => {
    const { state, chat } = createHarness();
    state.speedDisplayEl = document.getElementById("speed-display");
    state.sessionCache.set("s2", { pendingEvents: [] }); // 后台会话需已有缓存条目

    chat.handleServerMessage(speedMessage(1, 18.4, "s2"));
    expect(state.speedDisplayEl.textContent).toBe("");
    const cached = state.sessionCache.get("s2");
    expect(cached?.pendingEvents).toHaveLength(1);
    expect(cached.pendingEvents[0].type).toBe("chatSpeed");
  });

  it("chatEnd 用真实 outputTokens 显示精确平均", () => {
    const { state, chat } = createHarness();
    state.speedDisplayEl = document.getElementById("speed-display");

    chat.handleServerMessage({
      type: "chatEnd",
      sessionId: "s1",
      runId: "run-1",
      sequence: 1,
      fullResponse: "done",
      tokenSpeed: { tokensPerSecond: 20, totalTokens: 500, elapsedMs: 5000, ts: 1, outputTokens: 830 },
    });
    expect(state.speedDisplayEl.textContent).toBe("166 tok/s"); // 830 / 5s
  });

  it("取消生成即清除速度显示", () => {
    const { state, chat } = createHarness();
    state.speedDisplayEl = document.getElementById("speed-display");

    chat.handleServerMessage(speedMessage(1, 18.4));
    expect(state.speedDisplayEl.textContent).not.toBe("");
    chat.handleServerMessage({ type: "chatCancelled", sessionId: "s1", runId: "run-1", sequence: 2, fullResponse: "" });
    expect(state.speedDisplayEl.textContent).toBe("");
  });

  it("静默超过 2.5s 后加 speed-stale 淡化", () => {
    vi.useFakeTimers();
    const { state, chat } = createHarness();
    state.speedDisplayEl = document.getElementById("speed-display");

    chat.handleServerMessage(speedMessage(1, 18.4));
    vi.advanceTimersByTime(2600);
    expect(state.speedDisplayEl.classList.contains("speed-stale")).toBe(true);
  });
});
