import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { RouteHandler } from "../http-types.js";
import { readJsonBody, sendJson } from "../http-types.js";
import { listCommands } from "../services/commands.js";
import { listDocBrowserEntries, readDocBrowserFile, writeDocBrowserFile } from "../services/documents.js";
import { getKnowledgeOverview } from "../services/knowledge.js";
import { IMAGE_MIME_BY_EXT, isImageFile, listAllowedFiles, resolveAllowedImagePath } from "../services/media.js";

export const handleContentRoutes: RouteHandler = async ({ req, res, url, config }) => {
  if (url.pathname === "/api/knowledge" && req.method === "GET") {
    sendJson(res, await getKnowledgeOverview());
    return true;
  }
  if (url.pathname === "/api/documents/tree" && req.method === "GET") {
    try {
      sendJson(res, await listDocBrowserEntries(url.searchParams.get("path") ?? ""));
    } catch (error) {
      sendJson(res, { error: (error as Error).message || "Failed to load directory" }, 400);
    }
    return true;
  }
  if (url.pathname === "/api/documents/content" && req.method === "GET") {
    try {
      sendJson(res, await readDocBrowserFile(url.searchParams.get("path") ?? ""));
    } catch (error) {
      sendJson(res, { error: (error as Error).message || "Failed to load document" }, 400);
    }
    return true;
  }
  if (url.pathname === "/api/documents/content" && req.method === "PUT") {
    try {
      const data = await readJsonBody<{ path?: string; content?: string }>(req);
      if (!data.path) {
        sendJson(res, { error: "Missing document path" }, 400);
        return true;
      }
      await writeDocBrowserFile(data.path, data.content ?? "");
      sendJson(res, { ok: true });
    } catch (error) {
      sendJson(res, { error: (error as Error).message || "Failed to save document" }, 400);
    }
    return true;
  }
  if (url.pathname === "/api/files" && req.method === "GET") {
    sendJson(res, { files: await listAllowedFiles(config, url.searchParams.get("q") ?? "") });
    return true;
  }
  if (url.pathname === "/api/commands" && req.method === "GET") {
    sendJson(res, { commands: await listCommands(url.searchParams.get("q") ?? "") });
    return true;
  }
  if (url.pathname === "/api/image" && req.method === "GET") {
    try {
      const resolved = resolveAllowedImagePath(config, url.searchParams.get("path") ?? "");
      if (!isImageFile(resolved)) throw new Error("Not an image");
      res.setHeader("Content-Type", IMAGE_MIME_BY_EXT[extname(resolved).toLowerCase()] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(await readFile(resolved));
    } catch {
      res.statusCode = 404;
      res.end("Image not found");
    }
    return true;
  }
  return false;
};
