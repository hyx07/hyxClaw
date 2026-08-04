import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { getTestDir } from "../config/paths.js";
import { loadAppState, recordRecentModel, recordRecentPreviewFile, setLastActiveSession } from "./index.js";

let testDir: string;

describe("app state", () => {
  beforeEach(() => {
    testDir = getTestDir();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("keeps only three recent previews without reordering existing files", async () => {
    await recordRecentPreviewFile("inputs/a.md", testDir);
    await recordRecentPreviewFile("inputs/b.md", testDir);
    await recordRecentPreviewFile("inputs/c.md", testDir);
    await recordRecentPreviewFile("knowledge_base/example/d.md", testDir);
    await recordRecentPreviewFile("inputs/b.md", testDir);

    expect((await loadAppState(testDir)).recentPreviewFiles).toEqual([
      "knowledge_base/example/d.md",
      "inputs/c.md",
      "inputs/b.md",
    ]);
  });

  it("preserves recent previews when changing the active session", async () => {
    await recordRecentPreviewFile("inputs/notes.md", testDir);
    await setLastActiveSession("session-1", testDir);

    expect(await loadAppState(testDir)).toEqual({
      lastActiveSessionId: "session-1",
      recentPreviewFiles: ["inputs/notes.md"],
      recentModels: [],
    });
  });

  it("records recent models, dedupes and keeps newest first", async () => {
    await recordRecentModel("zai", "glm-4.7", testDir);
    await recordRecentModel("deepseek", "deepseek-r1", testDir);
    await recordRecentModel("zai", "glm-4.7", testDir);
    await recordRecentModel("zai", "glm-4.6", testDir);
    await recordRecentModel("deepseek", "deepseek-v3", testDir);
    await recordRecentModel("openai", "gpt-4o", testDir);

    expect((await loadAppState(testDir)).recentModels).toEqual([
      { provider: "openai", model: "gpt-4o" },
      { provider: "deepseek", model: "deepseek-v3" },
      { provider: "zai", model: "glm-4.6" },
      { provider: "zai", model: "glm-4.7" },
      { provider: "deepseek", model: "deepseek-r1" },
    ]);
  });

  it("drops invalid recent model entries when loading", async () => {
    const { saveAppState } = await import("./index.js");
    await saveAppState({ recentPreviewFiles: [], recentModels: [{ provider: "zai", model: "" }] }, testDir);

    expect((await loadAppState(testDir)).recentModels).toEqual([]);
  });
});
