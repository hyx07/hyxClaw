/**
 * Path utilities - Resolve user data directory and paths
 */

import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import dotenv from "dotenv";
dotenv.config();

/**
 * Get the user data directory
 *
 * Must be configured via .env file: HYXCLAW_DATA_DIR=/path/to/data
 * This is required - no default value provided to avoid confusion
 */
export function getUserDataDir(): string {
  const envDir = process.env.HYXCLAW_DATA_DIR;
  if (envDir) {
    return envDir;
  }

  throw new Error(
    "HYXCLAW_DATA_DIR environment variable is not set!\n" +
    "Please create a .env file in the project root with:\n" +
    "HYXCLAW_DATA_DIR=/path/to/your/data/directory\n\n" +
    "See .env.example for reference."
  );
}

/**
 * Get paths relative to user data directory
 */
export function getPaths(userDataDir?: string) {
  const base = userDataDir ?? getUserDataDir();

  return {
    base,
    config: path.join(base, "config.json"),
    logs: path.join(base, "logs"),
    conversations: path.join(base, "conversations"),
    conversationArchive: path.join(base, "conversation_archive"),
    inputs: path.join(base, "inputs"),
    knowledgeBase: path.join(base, "knowledge_base"),
    files: path.join(base, "files"),
    commandsFile: path.join(base, "files", "commands.md"),
    usageTempFile: path.join(base, "files", "usage_temp.json"),
    usageDaily: path.join(base, "files", "usage_daily.json"),
    usageTotal: path.join(base, "files", "usage_total.json"),
    appStateFile: path.join(base, "files", "app_state.json"),
    agentSystemPromptFile: path.join(base, "files", "prompts", "agent_system_prompt.txt"),
    compactionPromptFile: path.join(base, "files", "prompts", "compaction_prompt.txt"),
    knowledgeInstructionsFile: path.join(base, "knowledge_base", "instructions.md"),
    installedTemplatesFile: path.join(base, ".installed_templates.json"),
  };
}

/**
 * Ensure all required directories exist
 */
export async function ensureDirectories(paths: ReturnType<typeof getPaths>): Promise<void> {
  const fs = await import("node:fs/promises");

  await fs.mkdir(paths.base, { recursive: true });

  const dirs = [
    paths.logs,
    paths.conversations,
    paths.conversationArchive,
    paths.inputs,
    paths.knowledgeBase,
    paths.files,
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Check if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a temporary test data directory
 * Creates a unique temp directory for each test run
 */
export function getTestDir(): string {
  const testId = crypto.randomBytes(8).toString("hex");
  return path.join(os.tmpdir(), `hyxclaw-test-${testId}`);
}
