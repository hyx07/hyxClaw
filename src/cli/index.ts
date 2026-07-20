/**
 * CLI - Command Line Interface
 *
 * Provides commands for starting the server and managing sessions
 */

import { Command } from "commander";
import { getLogger } from "../logger/index.js";
import { startServer } from "../server/index.js";
import { initConfig, loadConfig, getDefaultProviderCredential } from "../config/index.js";
import { listSessions, createSession, getInitialSession } from "../session/index.js";
import { getPaths } from "../config/paths.js";

const program = new Command();

program
  .name("hyxclaw")
  .description("Personal AI Assistant")
  .version("0.1.0");

/**
 * Start command - runs the web server
 */
program
  .command("start")
  .description("Start the hyxClaw server")
  .option("-p, --port <number>", "Port to listen on", undefined)
  .option("-h, --host <address>", "Host address to bind to", undefined)
  .action(async (options) => {
    try {
      // Init config (creates default if not exists)
      const config = await initConfig();
      const paths = getPaths();
      const logger = getLogger(paths.logs);

      // Require API key before starting
      const defaultCredential = getDefaultProviderCredential(config);
      if (!defaultCredential.apiKey) {
        logger.error("API Key not set! Please edit config.json and set your LLM API key.");
        logger.error(`Config file: ${paths.config}`);
        process.exit(1);
      }

      // Override port/host if specified (options take precedence over env vars)
      const port = options.port ? parseInt(options.port, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : undefined);
      const host = options.host ?? process.env.HOST ?? undefined;

      if (port) {
        config.server.port = port;
      }
      if (host) {
        config.server.host = host;
      }

      // Start server with port/host overrides
      const state = await startServer({
        port,
        host,
        config,
      });

      logger.info(`Web UI: http://${state.host}:${state.port}`);

      // Handle graceful shutdown
      let shuttingDown = false;
      const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`Received ${signal}, shutting down...`);
        if (process.platform === "win32" && process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        stopServer(state);
        process.exit(0);
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));

      if (process.platform === "win32" && process.stdin.isTTY) {
        const readline = await import("node:readline");
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on("keypress", (_str, key) => {
          if (key && key.ctrl && key.name === "c") {
            shutdown("SIGINT");
          }
        });
      }

      // Keep process alive
      logger.info("Press Ctrl+C to stop the server");
    } catch (error) {
      const logger = getLogger(getPaths().logs);
      logger.error(`Failed to start server: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Config command - shows config location and current settings
 */
program
  .command("config")
  .description("Show configuration location and current settings")
  .action(async () => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      const config = await loadConfig();

      console.log("\n=== hyxClaw Configuration ===");
      console.log(`User Data Directory: ${paths.base}`);
      console.log(`Config File: ${paths.config}`);
      console.log(`Conversations: ${paths.conversations}`);
      console.log("");
      console.log("--- Current Settings ---");
      const defaultCredential = config.providers[config.defaultProvider];
      console.log(`LLM Provider: ${config.defaultProvider}`);
      console.log(`LLM Model: ${config.defaultModel}`);
      console.log(`API Key: ${defaultCredential?.apiKey ? "***SET***" : "***NOT SET***"}`);
      console.log(`Base URL: ${defaultCredential?.baseUrl || ""}`);
      console.log("");
      console.log(`Server Port: ${config.server.port}`);
      console.log(`Server Host: ${config.server.host}`);
    } catch (error) {
      logger.error(`Failed to load config: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Init command - initialize config
 */
program
  .command("init")
  .description("Initialize configuration")
  .action(async () => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      const config = await initConfig();
      logger.info("Configuration initialized successfully");
      logger.info(`Please edit config.json and set your API Key.`);
      logger.info(`Config location: ${paths.config}`);
    } catch (error) {
      logger.error(`Failed to initialize config: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Sessions command - list sessions
 */
program
  .command("sessions")
  .description("List all chat sessions")
  .action(async () => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      const sessions = await listSessions();

      console.log(`\n=== Sessions (${sessions.length}) ===`);
      if (sessions.length === 0) {
        console.log("No sessions found. Create one with 'hyxclaw chat' or 'hyxclaw session:create'");
      } else {
        for (const session of sessions) {
          const updatedAt = new Date(session.updatedAt).toLocaleString();
          const messageCount = session.messages.length;
          console.log(`\n  ${session.title}`);
          console.log(`    ID: ${session.id}`);
          console.log(`    Messages: ${messageCount}`);
          console.log(`    Updated: ${updatedAt}`);
        }
      }
      console.log("");
    } catch (error) {
      logger.error(`Failed to list sessions: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Session:create command - create a new session
 */
program
  .command("session:create")
  .description("Create a new chat session")
  .argument("[title]", "Session title", "New Chat")
  .action(async (title) => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      const session = await createSession(title);
      console.log(`\nSession created: ${session.title}`);
      console.log(`ID: ${session.id}`);
      console.log(`\nStart chatting with 'hyxclaw chat ${session.id}'`);
    } catch (error) {
      logger.error(`Failed to create session: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Chat command - start an interactive chat session (TBD)
 */
program
  .command("chat")
  .description("Start an interactive chat session")
  .argument("[session]", "Session ID to use (optional)")
  .action(async (sessionId) => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      // Check if API key is set
      const config = await loadConfig();
      if (!getDefaultProviderCredential(config).apiKey) {
        logger.error("API Key not set! Please edit config.json and set your LLM API key.");
        logger.error("Run 'hyxclaw config' to see config location.");
        process.exit(1);
      }

      // Get or create session
      let session;
      if (sessionId) {
        const sessions = await listSessions();
        session = sessions.find((s) => s.id === sessionId);
        if (!session) {
          logger.error(`Session not found: ${sessionId}`);
          process.exit(1);
        }
      } else {
        session = await getInitialSession();
      }

      console.log(`\n=== Chat: ${session.title} ===`);
      console.log("Interactive chat is not yet implemented.");
      console.log("Please use the web interface: 'hyxclaw start'\n");
      console.log(`Session ID: ${session.id}`);
    } catch (error) {
      logger.error(`Failed to start chat: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Status command - check system status
 */
program
  .command("status")
  .description("Check system status")
  .action(async () => {
    const paths = getPaths();
    const logger = getLogger(paths.logs);
    try {
      const config = await loadConfig();
      const sessions = await listSessions();

      console.log("\n=== hyxClaw Status ===");
      console.log("");
      console.log("Configuration:");
      console.log(`  ✓ Config file exists`);
      console.log(`  ✓ API Key ${config.providers[config.defaultProvider]?.apiKey ? "set" : "NOT SET"}`);
      console.log("");
      console.log("Data:");
      console.log(`  ✓ ${sessions.length} session(s)`);
      console.log("");
      console.log("Server:");
      console.log(`  - Port: ${config.server.port}`);
      console.log(`  - Host: ${config.server.host}`);
      console.log("");
      console.log(`Ready to start! Run 'hyxclaw start' to launch the server.`);
    } catch (error) {
      logger.error(`Status check failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/**
 * Main entry point
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  await program.parseAsync(argv);
}

/**
 * Helper to stop server (needed for closure in command handler)
 */
async function stopServer(state: unknown): Promise<void> {
  const { stopServer: stop } = await import("../server/index.js");
  await stop(state as Parameters<typeof stop>[0]);
}

// Run CLI
main().catch((error) => {
  const logger = getLogger(getPaths().logs);
  logger.error("Fatal error", error);
  process.exit(1);
});
