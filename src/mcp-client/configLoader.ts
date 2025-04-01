import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
// Import RequestContext type directly
import { RequestContext, requestContextService } from "../utils/requestContext.js";
// Import local McpError and BaseErrorCode
import { BaseErrorCode, McpError } from "../types-global/errors.js";

// Define the expected structure of a single server config entry
export interface McpServerConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  // Add other potential fields like 'disabled', 'autoApprove' if needed later
}

// Define the structure of the entire config file
interface McpClientConfigFile {
  mcpServers: Record<string, McpServerConfigEntry>;
}

// Determine the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Construct the path to the config file relative to the current file
const configFilePath = join(__dirname, 'mcp-config.json');

let loadedConfig: McpClientConfigFile | null = null;

/**
 * Loads and validates the MCP client configuration from mcp-config.json.
 * Caches the loaded configuration to avoid repeated file reads.
 *
 * @param parentContext - Optional parent request context for logging.
 * @returns The loaded and validated MCP server configurations.
 * @throws McpError if the file cannot be read, parsed, or validated.
 */
export function loadMcpClientConfig(parentContext?: RequestContext | null): McpClientConfigFile {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: 'loadMcpClientConfig',
    filePath: configFilePath,
  });

  // Return cached config if already loaded
  if (loadedConfig) {
    logger.debug("Returning cached MCP client config", context);
    return loadedConfig;
  }

  logger.info(`Loading MCP client configuration from: ${configFilePath}`, context);

  try {
    const fileContent = readFileSync(configFilePath, 'utf-8');
    const parsedConfig = JSON.parse(fileContent) as McpClientConfigFile;

    // Basic validation (can be expanded with Zod or similar later)
    if (!parsedConfig || typeof parsedConfig !== 'object' || !parsedConfig.mcpServers || typeof parsedConfig.mcpServers !== 'object') {
      throw new Error("Invalid structure: 'mcpServers' object missing or invalid.");
    }

    // Validate individual server entries (basic example)
    for (const serverName in parsedConfig.mcpServers) {
      const serverConf = parsedConfig.mcpServers[serverName];
      if (!serverConf || typeof serverConf.command !== 'string' || !Array.isArray(serverConf.args)) {
        throw new Error(`Invalid configuration for server '${serverName}'. Missing or invalid 'command' or 'args'.`);
      }
      // Add more validation as needed (e.g., for env)
    }

    logger.info("MCP client configuration loaded and validated successfully", {
      ...context,
      serversFound: Object.keys(parsedConfig.mcpServers).length,
    });

    loadedConfig = parsedConfig; // Cache the loaded config
    return loadedConfig;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to load or parse MCP client configuration", {
      ...context,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Throw a specific MCP error for better handling upstream
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Failed to load MCP client config: ${errorMessage}`,
      { originalError: error }
    );
  }
}

/**
 * Retrieves the configuration for a specific MCP server by name.
 *
 * @param serverName - The name of the server to retrieve configuration for.
 * @param parentContext - Optional parent request context for logging.
 * @returns The configuration entry for the specified server.
 * @throws McpError if the configuration hasn't been loaded or the server name is not found.
 */
export function getMcpServerConfig(serverName: string, parentContext?: RequestContext | null): McpServerConfigEntry {
  const context = requestContextService.createRequestContext({
    ...(parentContext ?? {}),
    operation: 'getMcpServerConfig',
    targetServer: serverName,
  });

  const config = loadMcpClientConfig(context); // Ensure config is loaded

  const serverConfig = config.mcpServers[serverName];

  if (!serverConfig) {
    logger.error(`Configuration for MCP server "${serverName}" not found.`, context);
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Configuration for MCP server "${serverName}" not found in ${configFilePath}.`
    );
  }

  logger.debug(`Retrieved configuration for server "${serverName}"`, context);
  return serverConfig;
}
