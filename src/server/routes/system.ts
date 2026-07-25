import { getAvailableProviders, type Config, type ProviderName } from "../../config/index.js";
import { loadAppState, recordRecentPreviewFile, removeRecentPreviewFile } from "../../app-state/index.js";
import { readDocBrowserFile } from "../services/documents.js";
import { flushUsage, getDailyStats, getUsageStats } from "../services/usage-store.js";
import type { RouteHandler } from "../http-types.js";
import { readJsonBody, sendJson } from "../http-types.js";

export const handleSystemRoutes: RouteHandler = async ({ req, res, url, config, gitSyncEnabled }) => {
  if (url.pathname === "/health" && req.method === "GET") {
    sendJson(res, { status: "ok" });
    return true;
  }
  if (url.pathname === "/api/config" && req.method === "GET") {
    sendJson(res, {
      availableProviders: getAvailableProviders(config),
      providers: Object.fromEntries(
        (Object.entries(config.providers) as Array<[ProviderName, Config["providers"][ProviderName]]>)
          .map(([name, provider]) => [name, { models: provider.models }]),
      ),
      defaultProvider: config.defaultProvider,
      defaultModel: config.defaultModel,
      defaultThinkingEffort: config.defaultThinkingEffort,
      gitSyncEnabled,
    });
    return true;
  }
  if (url.pathname === "/api/app-state" && req.method === "GET") {
    sendJson(res, await loadAppState());
    return true;
  }
  if (url.pathname === "/api/app-state/recent-preview-files" && req.method === "POST") {
    try {
      const data = await readJsonBody<{ path?: string }>(req);
      if (!data.path) throw new Error("Missing document path");
      const document = await readDocBrowserFile(data.path);
      sendJson(res, await recordRecentPreviewFile(document.path));
    } catch (error) {
      sendJson(res, { error: (error as Error).message || "Failed to update app state" }, 400);
    }
    return true;
  }
  if (url.pathname === "/api/app-state/recent-preview-files" && req.method === "DELETE") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      sendJson(res, { error: "Missing document path" }, 400);
    } else {
      sendJson(res, await removeRecentPreviewFile(filePath));
    }
    return true;
  }
  if (url.pathname === "/api/usage/flush" && req.method === "POST") {
    await flushUsage();
    sendJson(res, { ok: true });
    return true;
  }
  if (url.pathname === "/api/usage/stats" && req.method === "GET") {
    sendJson(res, await getUsageStats());
    return true;
  }
  if (url.pathname === "/api/usage/daily" && req.method === "GET") {
    const days = parseInt(url.searchParams.get("days") || "7", 10);
    sendJson(res, await getDailyStats(Math.min(Math.max(days, 1), 90)));
    return true;
  }
  return false;
};
