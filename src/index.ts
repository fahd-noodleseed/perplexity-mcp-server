#!/usr/bin/env node
import { config, environment } from "./config/index.js";
import { createMcpServer } from "./mcp-server/server.js";
import { BaseErrorCode } from "./types-global/errors.js";
import { ErrorHandler } from "./utils/errorHandler.js";
import { logger } from "./utils/logger.js";
// Import the service instance instead of the standalone function
import { requestContextService } from "./utils/requestContext.js";

// Define a type alias for the server instance for better readability
type McpServerInstance = Awaited<ReturnType<typeof createMcpServer>>;

/**
 * The main MCP server instance.
 * @type {McpServerInstance | undefined}
 */
let server: McpServerInstance | undefined;

/**
 * Gracefully shuts down the main MCP server.
 * Handles process termination signals (SIGTERM, SIGINT) and critical errors.
 *
 * @param signal - The signal or event name that triggered the shutdown (e.g., "SIGTERM", "uncaughtException").
 */
const shutdown = async (signal: string) => {
  // Define context for the shutdown operation
  const shutdownContext = {
    operation: 'Shutdown',
    signal,
  };

  logger.info(`Received ${signal}. Starting graceful shutdown...`, shutdownContext);

  try {
    // Close the main MCP server
    if (server) {
      logger.info("Closing main MCP server...", shutdownContext);
      await server.close();
      logger.info("Main MCP server closed successfully", shutdownContext);
    } else {
      logger.warn("Server instance not found during shutdown.", shutdownContext);
    }

    logger.info("Graceful shutdown completed successfully", shutdownContext);
    process.exit(0);
  } catch (error) {
    // Handle any errors during shutdown
    logger.error("Critical error during shutdown", {
      ...shutdownContext,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1); // Exit with error code if shutdown fails
  }
};

/**
 * Initializes and starts the main MCP server.
 * Sets up request context, creates the server instance, and registers signal handlers
 * for graceful shutdown and error handling.
 */
const start = async () => {
  // Create application-level request context using the service instance
  const startupContext = requestContextService.createRequestContext({
    operation: 'ServerStartup',
    appName: config.mcpServerName,
    appVersion: config.mcpServerVersion,
    environment: environment // Use imported environment
  });

  logger.info(`Starting ${config.mcpServerName} v${config.mcpServerVersion}...`, startupContext);

  try {
    // Create and store the main server instance
    logger.debug("Creating main MCP server instance", startupContext);
    // Use ErrorHandler to wrap the server creation, ensuring errors are caught and logged
    server = await ErrorHandler.tryCatch(
      async () => await createMcpServer(),
      {
        operation: 'creating main MCP server',
        context: startupContext, // Pass the established startup context
        errorCode: BaseErrorCode.INTERNAL_ERROR // Specify error code for failure
      }
    );

    // If tryCatch encountered an error, it would have thrown,
    // and execution would jump to the outer catch block.

    logger.info(`${config.mcpServerName} is running and awaiting messages`, {
      ...startupContext,
      startTime: new Date().toISOString(),
    });

    // --- Signal and Error Handling Setup ---

    // Handle process signals for graceful shutdown
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", async (error) => {
      const errorContext = {
        ...startupContext, // Include base context for correlation
        event: 'uncaughtException',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      logger.error("Uncaught exception detected. Initiating shutdown...", errorContext);
      // Attempt graceful shutdown; shutdown() handles its own errors.
      await shutdown("uncaughtException");
      // If shutdown fails internally, it will call process.exit(1).
      // If shutdown succeeds, it calls process.exit(0).
      // If shutdown itself throws unexpectedly *before* exiting, this process might terminate abruptly,
      // but the core shutdown logic is handled within shutdown().
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", async (reason: unknown) => {
      const rejectionContext = {
        ...startupContext, // Include base context for correlation
        event: 'unhandledRejection',
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      };
      logger.error("Unhandled promise rejection detected. Initiating shutdown...", rejectionContext);
      // Attempt graceful shutdown; shutdown() handles its own errors.
      await shutdown("unhandledRejection");
      // Similar logic as uncaughtException: shutdown handles its exit codes.
    });
  } catch (error) {
    // Handle critical startup errors (already logged by ErrorHandler or caught above)
    // Log the final failure context, including error details, before exiting
    logger.error("Critical error during startup, exiting.", {
      ...startupContext,
      finalErrorContext: 'Startup Failure',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Start the application
start();
