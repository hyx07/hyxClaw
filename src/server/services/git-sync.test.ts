import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { cleanupTestDir, setupTestDir } from "../../test-utils.js";
import { getGitSyncStatus, pullGitSync, pushGitSync } from "./git-sync.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}

describe("git sync service", () => {
  it("rejects pull when the work tree has local changes", async () => {
    const dataDir = await setupTestDir("git-sync-dirty");
    try {
      await git(dataDir, "init");
      await writeFile(path.join(dataDir, "note.md"), "initial\n", "utf-8");
      await git(dataDir, "add", "-A");
      await git(dataDir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial");
      await writeFile(path.join(dataDir, "note.md"), "changed\n", "utf-8");

      await expect(pullGitSync(dataDir)).rejects.toMatchObject({ code: "working_tree_dirty" });
      await expect(getGitSyncStatus(dataDir)).resolves.toMatchObject({ changes: 1 });
    } finally {
      await cleanupTestDir(dataDir);
    }
  });

  it("commits changes and pushes them to the configured upstream", async () => {
    const dataDir = await setupTestDir("git-sync-push");
    const remoteDir = path.join(path.dirname(dataDir), "git-sync-push-remote.git");
    try {
      await git(dataDir, "init");
      await git(dataDir, "config", "user.name", "Test");
      await git(dataDir, "config", "user.email", "test@example.com");
      await writeFile(path.join(dataDir, "note.md"), "initial\n", "utf-8");
      await git(dataDir, "add", "-A");
      await git(dataDir, "commit", "-m", "initial");
      await mkdir(remoteDir);
      await git(remoteDir, "init", "--bare");
      await git(dataDir, "remote", "add", "origin", remoteDir);
      await git(dataDir, "push", "-u", "origin", "HEAD");
      await writeFile(path.join(dataDir, "note.md"), "updated\n", "utf-8");

      const result = await pushGitSync(dataDir);

      expect(result.committed).toBe(true);
      expect(result.status.changes).toBe(0);
      await expect(execFileAsync("git", ["log", "-1", "--format=%s"], { cwd: remoteDir })).resolves.toMatchObject({ stdout: expect.stringMatching(/^hyxClaw sync:/) });
    } finally {
      await cleanupTestDir(dataDir);
      await rm(remoteDir, { recursive: true, force: true });
    }
  });
});
