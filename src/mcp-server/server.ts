/**
 * @fileoverview Main entry point for the MCP (Model Context Protocol) server.
 * This file orchestrates the server's lifecycle:
 * 1. Initializes the core `McpServer` instance.
 * 2. Registers available tools.
 * 3. Selects and starts the appropriate communication transport.
 * 4. Handles top-level error management during startup.
 * @module src/mcp-server/server
 */

import { ServerType } from "@hono/node-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config, environment } from "../config/index.js";
import { BaseErrorCode } from "../types-global/errors.js";
import { ErrorHandler, logger, requestContextService } from "../utils/index.js";

// Import registration functions for all tools (alphabetized)
import { registerPerplexityDeepResearchTool } from "./tools/perplexityDeepResearch/index.js";
import { registerPerplexitySearchTool } from "./tools/perplexitySearch/index.js";

// Import transport setup functions
import { startHttpTransport } from "./transports/httpTransport.js";
import { connectStdioTransport } from "./transports/stdioTransport.js";

/**
 * Creates and configures a new instance of the `McpServer`.
 * @returns A promise resolving with the configured `McpServer` instance.
 * @throws {McpError} If any tool registration fails.
 */
async function createMcpServerInstance(): Promise<McpServer> {
  const context = requestContextService.createRequestContext({
    operation: "createMcpServerInstance",
  });
  logger.info("Initializing MCP server instance", context);

  requestContextService.configure({
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment,
  });

  const server = new McpServer(
    { name: config.mcpServerName, version: config.mcpServerVersion },
    {
      capabilities: {
        logging: {},
        resources: { listChanged: true },
        tools: { listChanged: true },
      },
    },
  );

  await ErrorHandler.tryCatch(
    async () => {
      logger.debug("Registering tools...", context);
      await registerPerplexityDeepResearchTool(server);
      await registerPerplexitySearchTool(server);
      logger.info("Tools registered successfully", context);
    },
    {
      operation: "registerAllTools",
      context,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );

  return server;
}

/**
 * Selects, sets up, and starts the appropriate MCP transport layer.
 * @returns Resolves with `McpServer` for 'stdio', `http.Server` for 'http', or `void`.
 * @throws {Error} If transport type is unsupported or setup fails.
 */
async function startTransport(): Promise<McpServer | ServerType | void> {
  const transportType = config.mcpTransportType;
  const context = requestContextService.createRequestContext({
    operation: "startTransport",
    transport: transportType,
  });
  logger.info(`Starting transport: ${transportType}`, context);

  const server = await createMcpServerInstance();

  if (transportType === "http") {
    // Wrap the created server instance in a function to match the expected signature
    return startHttpTransport(() => Promise.resolve(server), context);
  }

  if (transportType === "stdio") {
    await connectStdioTransport(server, context);
    return server;
  }

  throw new Error(
    `Unsupported transport type: ${transportType}. Must be 'stdio' or 'http'.`,
  );
}

/**
 * Main application entry point. Initializes and starts the MCP server.
 */
export async function initializeAndStartServer(): Promise<void | McpServer | ServerType> {
  const context = requestContextService.createRequestContext({
    operation: "initializeAndStartServer",
  });
  logger.info("MCP Server initialization sequence started.", context);
  try {
    const result = await startTransport();
    logger.info("MCP Server initialization sequence completed successfully.", context);
    return result;
  } catch (err) {
    logger.fatal("Critical error during MCP server initialization.", {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    ErrorHandler.handleError(err, {
      operation: "initializeAndStartServer_Catch",
      context: context,
      critical: true,
    });
    logger.info("Exiting process due to critical initialization error.", context);
    process.exit(1);
  }
}
