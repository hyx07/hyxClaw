import fs from "node:fs/promises";
import { getPaths, pathExists } from "../config/paths.js";

export interface AppState {
  lastActiveSessionId?: string;
}

const DEFAULT_APP_STATE: AppState = {};

export async function loadAppState(userDataDir?: string): Promise<AppState> {
  const paths = getPaths(userDataDir);
  if (!(await pathExists(paths.appStateFile))) {
    return { ...DEFAULT_APP_STATE };
  }

  try {
    const raw = await fs.readFile(paths.appStateFile, "utf-8");
    const parsed = JSON.parse(raw) as AppState;
    return {
      lastActiveSessionId: typeof parsed.lastActiveSessionId === "string" ? parsed.lastActiveSessionId : undefined,
    };
  } catch {
    return { ...DEFAULT_APP_STATE };
  }
}

export async function saveAppState(state: AppState, userDataDir?: string): Promise<void> {
  const paths = getPaths(userDataDir);
  await fs.mkdir(paths.files, { recursive: true });
  await fs.writeFile(paths.appStateFile, JSON.stringify(state, null, 2), "utf-8");
}

export async function setLastActiveSession(sessionId: string, userDataDir?: string): Promise<void> {
  await saveAppState({ lastActiveSessionId: sessionId }, userDataDir);
}
