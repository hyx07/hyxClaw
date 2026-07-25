import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { getTestDir } from "../config/paths.js";
import { loadAppState, recordRecentPreviewFile, setLastActiveSession } from "./index.js";

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
    });
  });
});
