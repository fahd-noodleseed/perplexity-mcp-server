#!/usr/bin/env node

/**
 * @fileoverview Main entry point for the MCP application.
 * This script initializes the configuration, sets up the logger, starts the
 * MCP server, and handles graceful shutdown.
 * @module src/index
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import http from "http";
import { config, environment } from "./config/index.js";
import { initializeAndStartServer } from "./mcp-server/server.js";
import { requestContextService } from "./utils/internal/requestContext.js";
import { logger, McpLogLevel } from "./utils/internal/logger.js";

let mcpStdioServer: McpServer | undefined;
let actualHttpServer: http.Server | undefined;

const shutdown = async (signal: string): Promise<void> => {
  const shutdownContext = requestContextService.createRequestContext({
    operation: "ServerShutdown",
    triggerEvent: signal,
  });

  logger.info(
    `Received ${signal}. Initiating graceful shutdown...`,
    shutdownContext,
  );

  const shutdownPromises: Promise<void>[] = [];

  if (mcpStdioServer) {
    shutdownPromises.push(mcpStdioServer.close().catch(err => {
        logger.error("Error closing MCP server (STDIO).", { ...shutdownContext, error: err });
    }));
  }

  if (actualHttpServer) {
    shutdownPromises.push(new Promise((resolve) => {
        actualHttpServer!.close((err?: Error) => {
          if (err) {
            logger.error("Error closing HTTP server.", { ...shutdownContext, error: err });
          }
          resolve();
        });
    }));
  }

  await Promise.allSettled(shutdownPromises);

  logger.info(
    "Graceful shutdown completed successfully. Exiting.",
    shutdownContext,
  );
  process.exit(0);
};

const start = async (): Promise<void> => {
  const validMcpLogLevels: McpLogLevel[] = [
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "crit",
    "alert",
    "emerg",
  ];
  const initialLogLevelConfig = config.logLevel;

  let validatedMcpLogLevel: McpLogLevel = "info";
  if (validMcpLogLevels.includes(initialLogLevelConfig as McpLogLevel)) {
    validatedMcpLogLevel = initialLogLevelConfig as McpLogLevel;
  } else {
    console.warn(
      `[Startup Warning] Invalid LOG_LEVEL "${initialLogLevelConfig}" found in configuration. ` +
        `Defaulting to log level "info". Valid levels are: ${validMcpLogLevels.join(", ")}.`,
    );
  }
  await logger.initialize(validatedMcpLogLevel);

  const startupContext = requestContextService.createRequestContext({
    operation: `ServerStartupSequence_${config.mcpTransportType}`,
    applicationName: config.mcpServerName,
    applicationVersion: config.mcpServerVersion,
    nodeEnvironment: environment,
  });

  logger.info(
    `Starting ${config.mcpServerName} (v${config.mcpServerVersion}, Transport: ${config.mcpTransportType}, Env: ${environment})...`,
    startupContext,
  );

  try {
    const serverInstance = await initializeAndStartServer();

    if (config.mcpTransportType === "stdio" && serverInstance instanceof McpServer) {
      mcpStdioServer = serverInstance;
    } else if (config.mcpTransportType === "http" && serverInstance instanceof http.Server) {
      actualHttpServer = serverInstance;
    }

    logger.info(
      `${config.mcpServerName} is now running.`,
      { ...startupContext, serverStartTime: new Date().toISOString() },
    );

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("uncaughtException", (error: Error) => {
        logger.error("FATAL: Uncaught exception.", { ...startupContext, error: error.message, stack: error.stack });
        shutdown("uncaughtException");
    });
    process.on("unhandledRejection", (reason: unknown) => {
        logger.error("FATAL: Unhandled promise rejection.", { ...startupContext, reason });
        shutdown("unhandledRejection");
    });

  } catch (error) {
    logger.error(
      "CRITICAL ERROR DURING STARTUP. Exiting.",
      { ...startupContext, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
    );
    process.exit(1);
  }
};

(async () => {
  try {
    await start();
  } catch (error) {
    console.error("[GLOBAL CATCH] Unexpected error during startup:", error);
    process.exit(1);
  }
})();
