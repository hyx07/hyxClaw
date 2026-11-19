import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_ENDPOINT,
  OPENCODE_SESSION_HEADER,
  OPENCODE_USER_AGENT,
  OpenCodeProvider,
  buildOpenCodeHeaders,
} from "./opencode.js";
import type { Message } from "../../types/index.js";

const messages: Message[] = [{ id: "message", role: "user", content: "hello", timestamp: "2026-01-01T00:00:00.000Z" }];

function mockChatResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  return (fetchMock.mock.calls[0][1].headers ?? {}) as Record<string, string>;
}

describe("OpenCodeProvider", () => {
  it("maps raw usage to normalized usage（completion_tokens 含 thinking，需扣减）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockChatResponse({
        choices: [
          {
            message: { role: "assistant", content: "2", reasoning_content: "先算 1+1=2" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 60,
          total_tokens: 160,
          prompt_tokens_details: { cached_tokens: 20 },
          completion_tokens_details: { reasoning_tokens: 40 },
          opencode: {
            billing_source: "balance",
            tokens: { input: 80, output: 60, reasoning: 40, cache_read: 20, cache_write_5m: 5, cache_write_1h: 3 },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenCodeProvider().complete("test-key", messages);

    expect(result.content).toBe("2");
    expect(result.reasoning_content).toBe("先算 1+1=2");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      billingOutputTokens: 60,
      thinkingTokens: 40,
      cachedReadTokens: 20,
      cachedWriteTokens: 8,
    });
  });

  it("sends default endpoint/model and thinkingParams with the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockChatResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new OpenCodeProvider().complete("test-key", messages, {
      thinkingParams: { reasoning_effort: "off" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${OPENCODE_ENDPOINT}/chat/completions`);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.model).toBe(OPENCODE_DEFAULT_MODEL);
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(4096);
    expect(body.reasoning_effort).toBe("off");
  });

  it("sends custom User-Agent and x-opencode-session headers (Go 硬性要求)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockChatResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new OpenCodeProvider().complete("test-key", messages, { sessionId: "session-abc" });

    const headers = requestHeaders(fetchMock);
    expect(headers["User-Agent"]).toBe(OPENCODE_USER_AGENT);
    expect(headers["User-Agent"]).toMatch(/^hyxClaw\//);
    expect(headers[OPENCODE_SESSION_HEADER]).toBe("session-abc");
  });

  it("sends the same session header on streaming requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const gen = new OpenCodeProvider().stream("test-key", messages, { sessionId: "session-xyz" });
    while (!(await gen.next()).done) {
      // drain
    }

    expect(requestHeaders(fetchMock)[OPENCODE_SESSION_HEADER]).toBe("session-xyz");
    expect(requestHeaders(fetchMock)["User-Agent"]).toBe(OPENCODE_USER_AGENT);
  });

  it("falls back to a stable in-process session id when sessionId is absent", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      mockChatResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenCodeProvider();
    await provider.complete("test-key", messages);
    const first = requestHeaders(fetchMock)[OPENCODE_SESSION_HEADER];
    expect(first).toBeTruthy();

    await provider.complete("test-key", messages);
    expect(requestHeaders(fetchMock)[OPENCODE_SESSION_HEADER]).toBe(first);
  });

  it("stream parses delta.reasoning_content chunks and the terminal usage frame", async () => {
    const sse =
      'data: {"choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"先算 20*24"}}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"=480+96=576"}}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{"content":"576"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30,"completion_tokens_details":{"reasoning_tokens":15}}}\n\n' +
      "data: [DONE]\n\n";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const reasoningTexts: string[] = [];
    const contents: string[] = [];
    let usage: unknown = undefined;
    const gen = new OpenCodeProvider().stream("test-key", messages);
    let final: { finish_reason: string } | undefined;
    while (true) {
      const step = await gen.next();
      if (step.done) {
        final = step.value;
        break;
      }
      const chunk = step.value;
      if (chunk.type === "reasoning") reasoningTexts.push(chunk.text);
      if (chunk.type === "content") contents.push(chunk.text);
      if (chunk.type === "usage") usage = chunk.usage;
    }
    expect(reasoningTexts.join("")).toBe("先算 20*24=480+96=576");
    expect(contents.join("")).toBe("576");
    expect(final?.finish_reason).toBe("stop");
    expect(usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      billingOutputTokens: 20,
      thinkingTokens: 15,
      cachedReadTokens: undefined,
      cachedWriteTokens: undefined,
    });
  });

  it("keeps reasoning_content in outbound assistant messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockChatResponse({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const history: Message[] = [
      { id: "a", role: "user", content: "帮我算 17*23", timestamp: "2026-01-01T00:00:00.000Z" },
      {
        id: "b",
        role: "assistant",
        content: "我来计算。",
        timestamp: "2026-01-01T00:00:01.000Z",
        reasoning_content: "17*23 = 391",
      },
      { id: "c", role: "user", content: "结果是多少？", timestamp: "2026-01-01T00:00:02.000Z" },
    ];
    await new OpenCodeProvider().complete("test-key", history);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      messages: Array<{ role: string; content: unknown; reasoning_content?: string }>;
    };
    expect(body.messages[1].reasoning_content).toBe("17*23 = 391");
  });

  it("buildOpenCodeHeaders always carries UA and session (fallback included)", () => {
    const headers = buildOpenCodeHeaders("k", "s1");
    expect(headers.Authorization).toBe("Bearer k");
    expect(headers["User-Agent"]).toBe(OPENCODE_USER_AGENT);
    expect(headers[OPENCODE_SESSION_HEADER]).toBe("s1");
  });
});
