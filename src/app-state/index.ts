import fs from "node:fs/promises";
import { getPaths, pathExists } from "../config/paths.js";

export interface AppState {
  lastActiveSessionId?: string;
  recentPreviewFiles: string[];
}

const MAX_RECENT_PREVIEW_FILES = 3;
const DEFAULT_APP_STATE: AppState = { recentPreviewFiles: [] };

function normalizeRecentPreviewFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((path): path is string => typeof path === "string" && path.trim().length > 0))]
    .slice(0, MAX_RECENT_PREVIEW_FILES);
}

export async function loadAppState(userDataDir?: string): Promise<AppState> {
  const paths = getPaths(userDataDir);
  if (!(await pathExists(paths.appStateFile))) {
    return { ...DEFAULT_APP_STATE };
  }

  try {
    const raw = await fs.readFile(paths.appStateFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      lastActiveSessionId: typeof parsed.lastActiveSessionId === "string" ? parsed.lastActiveSessionId : undefined,
      recentPreviewFiles: normalizeRecentPreviewFiles(parsed.recentPreviewFiles),
    };
  } catch {
    return { ...DEFAULT_APP_STATE };
  }
}

export async function saveAppState(state: AppState, userDataDir?: string): Promise<void> {
  const paths = getPaths(userDataDir);
  const normalizedState: AppState = {
    lastActiveSessionId: typeof state.lastActiveSessionId === "string" ? state.lastActiveSessionId : undefined,
    recentPreviewFiles: normalizeRecentPreviewFiles(state.recentPreviewFiles),
  };
  await fs.mkdir(paths.files, { recursive: true });
  await fs.writeFile(paths.appStateFile, JSON.stringify(normalizedState, null, 2), "utf-8");
}

export async function setLastActiveSession(sessionId: string, userDataDir?: string): Promise<void> {
  const state = await loadAppState(userDataDir);
  await saveAppState({ ...state, lastActiveSessionId: sessionId }, userDataDir);
}

export async function recordRecentPreviewFile(filePath: string, userDataDir?: string): Promise<AppState> {
  const state = await loadAppState(userDataDir);
  if (state.recentPreviewFiles.includes(filePath)) return state;

  const recentPreviewFiles = [filePath, ...state.recentPreviewFiles].slice(0, MAX_RECENT_PREVIEW_FILES);
  const nextState = { ...state, recentPreviewFiles };
  await saveAppState(nextState, userDataDir);
  return nextState;
}

export async function removeRecentPreviewFile(filePath: string, userDataDir?: string): Promise<AppState> {
  const state = await loadAppState(userDataDir);
  const recentPreviewFiles = state.recentPreviewFiles.filter((path) => path !== filePath);
  const nextState = { ...state, recentPreviewFiles };
  await saveAppState(nextState, userDataDir);
  return nextState;
}
