import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { logger } from "../utils/logger.js";
import { RequestContext, requestContextService } from "../utils/requestContext.js";
import { getClientTransport } from "./transport.js";
// No need to load the full config here for client creation itself
// import { loadMcpClientConfig } from "./configLoader.js";

// Define a type for the connected client instance
export type ConnectedMcpClient = Client; // Alias for clarity

// Store connected clients (optional, could manage connections externally)
const connectedClients: Map<string, ConnectedMcpClient> = new Map();

/**
 * Creates, connects, and returns an MCP client instance for a specified server.
 * If a client for the server is already connected, it returns the existing instance.
 *
 * @param serverName - The name of the MCP server to connect to (must exist in mcp-config.json).
 * @param parentContext - Optional parent request context for logging.
 * @returns A promise resolving to the connected Client instance.
 * @throws McpError if configuration is missing, transport fails, or connection fails.
 */
export async function connectMcpClient(
  serverName: string,
  parentContext?: RequestContext | null
): Promise<ConnectedMcpClient> {
  const operationContext = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: 'connectMcpClient',
    targetServer: serverName,
  });

  // Check if client is already connected
  if (connectedClients.has(serverName)) {
    logger.debug(`Returning existing connected client for server: ${serverName}`, operationContext);
    return connectedClients.get(serverName)!;
  }

  logger.info(`Attempting to connect to MCP server: ${serverName}`, operationContext);

  return await ErrorHandler.tryCatch(
    async () => {
      // 1. Define Client Identity & Capabilities
      // TODO: Load this from a dedicated client section in config later if needed
      const clientIdentity = { name: `mcp-ts-template-client-for-${serverName}`, version: '1.0.0' };
      // Announce basic capabilities; the server will confirm what it supports.
      const clientCapabilities = { resources: {}, tools: {}, prompts: {} };

      // 2. Get the specific transport for the target server
      const transport = getClientTransport(serverName, operationContext); // This uses getMcpServerConfig internally

      // 3. Create the Client instance using the high-level SDK constructor
      logger.debug(`Creating MCP Client instance for ${serverName}`, operationContext);
      const client = new Client(clientIdentity, { capabilities: clientCapabilities });

      // 4. Setup error handling for the client/transport
      // The 'onerror' handler on the Client instance receives standard Error objects
      // (which might be instances of the SDK's McpError, which extends Error)
      client.onerror = (clientError: Error) => { // Expect a standard Error
        // Check if it has McpError-like properties for more detailed logging
        const errorCode = (clientError as any).code;
        const errorData = (clientError as any).data;
        logger.error(`MCP Client error for server ${serverName}`, {
          ...operationContext, // Include operation context
          error: clientError.message,
          code: errorCode, // Log code if it exists
          data: errorData, // Log data if it exists
          stack: clientError.stack, // Include stack if available
        });
        // Potentially trigger disconnect/cleanup logic here
        // Pass the original Error object
        disconnectMcpClient(serverName, operationContext, clientError);
      };
      // Transport errors are typically generic Errors
      transport.onerror = (transportError: Error) => {
         logger.error(`MCP Transport error for server ${serverName}`, {
           ...operationContext,
           error: transportError.message, // Use transportError
           stack: transportError.stack,   // Use transportError
         });
         // Transport errors often mean the connection is dead
         // Pass the original Error object
         disconnectMcpClient(serverName, operationContext, transportError);
      };
       transport.onclose = () => {
         logger.info(`MCP Transport closed for server ${serverName}`, operationContext);
         // Ensure client is marked as disconnected
         disconnectMcpClient(serverName, operationContext); // Attempt cleanup on close
       };


      // 5. Connect the client to the transport
      logger.info(`Connecting client to transport for ${serverName}...`, operationContext);
      await client.connect(transport);
      logger.info(`Successfully connected to MCP server: ${serverName}`, operationContext);

      // Store the connected client
      connectedClients.set(serverName, client);

      return client;
    },
    {
      operation: `connecting to MCP server ${serverName}`,
      context: operationContext,
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Or a more specific connection error code
      rethrow: true, // Ensure errors during connection are propagated
    }
  );
}

/**
 * Disconnects a specific MCP client and removes it from the cache.
 *
 * @param serverName - The name of the server whose client should be disconnected.
 * @param parentContext - Optional parent request context for logging.
 * @param error - Optional error that triggered the disconnect.
 */
export async function disconnectMcpClient(
    serverName: string,
    parentContext?: RequestContext | null,
    error?: Error | McpError
): Promise<void> {
    const context = requestContextService.createRequestContext({
        ...(parentContext ?? {}),
        operation: 'disconnectMcpClient',
        targetServer: serverName,
        triggerReason: error ? error.message : 'explicit disconnect or close',
    });

    const client = connectedClients.get(serverName);

    if (client) {
        logger.info(`Disconnecting client for server: ${serverName}`, context);
        try {
            await client.close(); // Attempt graceful close
            logger.info(`Client for ${serverName} closed successfully.`, context);
        } catch (closeError) {
            logger.error(`Error closing client for ${serverName}`, {
                ...context,
                error: closeError instanceof Error ? closeError.message : String(closeError),
                stack: closeError instanceof Error ? closeError.stack : undefined,
            });
            // Continue cleanup even if close fails
        } finally {
            connectedClients.delete(serverName); // Remove from cache regardless of close success/failure
            logger.debug(`Removed client ${serverName} from connection cache.`, context);
        }
    } else {
        logger.warn(`Client for server ${serverName} not found in cache or already disconnected.`, context);
        // Ensure it's removed if somehow still present but not retrieved correctly
        if (connectedClients.has(serverName)) {
             connectedClients.delete(serverName);
        }
    }
}

/**
 * Disconnects all currently connected MCP clients.
 * Useful for application shutdown.
 *
 * @param parentContext - Optional parent request context for logging.
 */
export async function disconnectAllMcpClients(parentContext?: RequestContext | null): Promise<void> {
    const context = requestContextService.createRequestContext({
        ...(parentContext ?? {}),
        operation: 'disconnectAllMcpClients',
    });
    logger.info("Disconnecting all MCP clients...", context);
    const disconnectionPromises: Promise<void>[] = [];
    for (const serverName of connectedClients.keys()) {
        disconnectionPromises.push(disconnectMcpClient(serverName, context));
    }
    try {
        await Promise.all(disconnectionPromises);
        logger.info("All MCP clients disconnected.", context);
    } catch (error) {
        logger.error("Error during disconnection of all clients", {
            ...context,
            error: error instanceof Error ? error.message : String(error),
        });
        // Decide if this should throw or just log
    }
}

// Optional: Graceful shutdown integration
// process.on('SIGINT', () => disconnectAllMcpClients().then(() => process.exit(0)));
// process.on('SIGTERM', () => disconnectAllMcpClients().then(() => process.exit(0)));
// Consider integrating this with the main app shutdown logic in index.ts instead
