import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// Remove direct import of main config
// import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
// Import RequestContext type directly
import { RequestContext, requestContextService } from "../utils/requestContext.js";
// Import the config loader and server config type
import { getMcpServerConfig, McpServerConfigEntry } from "./configLoader.js";
// Import McpError for error handling
import { BaseErrorCode, McpError } from "../types-global/errors.js";

/**
 * Configuration options for creating a StdioClientTransport.
 */
interface StdioTransportConfig {
  command: string;
  args: string[];
  // Potentially add env vars if needed later
}

/**
 * Creates and configures a StdioClientTransport instance.
 *
 * @param transportConfig - Configuration for the stdio transport.
 * @param parentContext - Optional parent request context for logging.
 * @returns A configured StdioClientTransport instance.
 * @throws McpError if configuration is invalid or transport creation fails.
 */
export function createStdioClientTransport(
  transportConfig: StdioTransportConfig,
  parentContext?: RequestContext | null // Allow null for clarity
): StdioClientTransport {
  // Manually merge parent context if provided
  const baseContext = parentContext ? { ...parentContext } : {};
  const context = requestContextService.createRequestContext({
    ...baseContext, // Spread parent context properties first
    operation: 'createStdioClientTransport', // Operation-specific context overrides parent
    transportType: 'stdio',
    command: transportConfig.command,
  });

  logger.debug("Creating StdioClientTransport", context);

  // Basic validation
  if (!transportConfig.command || typeof transportConfig.command !== 'string') {
    logger.error("Invalid command provided for StdioClientTransport", context);
    // Consider throwing a specific McpError here using ErrorHandler if needed
    throw new Error("Invalid command for StdioClientTransport");
  }
  if (!Array.isArray(transportConfig.args)) {
    logger.error("Invalid args provided for StdioClientTransport (must be an array)", context);
    throw new Error("Invalid args for StdioClientTransport");
  }

  try {
    const transport = new StdioClientTransport({
      command: transportConfig.command,
      args: transportConfig.args,
      // TODO: Add environment variable handling if required by servers
      // env: { ...process.env, ...config.client?.stdioEnv },
    });

    logger.info("StdioClientTransport created successfully", context);
    return transport;
  } catch (error) {
    logger.error("Failed to create StdioClientTransport", {
      ...context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Re-throw or wrap in McpError using ErrorHandler if more specific handling is needed
    throw error;
  }
}

/**
 * Retrieves and creates the appropriate client transport based on the configuration
 * for a specific MCP server. Currently only supports 'stdio'.
 *
 * @param serverName - The name of the MCP server to get the transport for.
 * @param parentContext - Optional parent request context for logging.
 * @returns A configured StdioClientTransport instance.
 * @throws McpError if configuration is missing, invalid, or transport creation fails.
 */
export function getClientTransport(serverName: string, parentContext?: RequestContext | null): StdioClientTransport {
  // Manually merge parent context if provided
  const baseContext = parentContext ? { ...parentContext } : {};
  const context = requestContextService.createRequestContext({
    ...baseContext,
    operation: 'getClientTransport',
    targetServer: serverName,
  });

  logger.info(`Getting transport for server: ${serverName}`, context);

  try {
    // Load the specific server's configuration using the loader
    const serverConfig = getMcpServerConfig(serverName, context);

    // Currently, we only support stdio based on the config structure
    // In the future, this could check serverConfig.transportType or similar
    logger.info(`Creating stdio transport for server: ${serverName}`, {
      ...context,
      command: serverConfig.command,
      args: serverConfig.args,
    });

    // Create the stdio transport using the loaded config
    // Note: We pass the relevant parts of McpServerConfigEntry to StdioTransportConfig
    const transport = createStdioClientTransport(
      {
        command: serverConfig.command,
        args: serverConfig.args,
        // Pass env if it exists in serverConfig
        // env: serverConfig.env
      },
      context // Pass the current context for logging within createStdioClientTransport
    );

    return transport;

  } catch (error) {
    // Log the error encountered during config loading or transport creation
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get or create transport for server "${serverName}"`, {
      ...context,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Re-throw as a specific McpError if it's not already one
    if (error instanceof McpError) {
      throw error;
    } else {
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR, // Or INTERNAL_ERROR depending on context
        `Failed to initialize transport for ${serverName}: ${errorMessage}`,
        { originalError: error }
      );
    }
  }
}
