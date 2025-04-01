import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js"; // Added .js extension

dotenv.config(); // Load environment variables from .env file

// Determine the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Construct the path to package.json relative to the current file
const pkgPath = join(__dirname, '../../package.json');
// Default package information in case package.json is unreadable
let pkg = { name: 'mcp-ts-template', version: '0.0.0' };

try {
  // Read and parse package.json to get server name and version
  pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
} catch (error) {
  // Log an error if reading or parsing fails, but continue with defaults
  logger.error("Failed to read or parse package.json. Using default name/version.", {
    path: pkgPath,
    error: error instanceof Error ? error.message : String(error)
  });
  // Continue with default pkg info
}

/**
 * Main application configuration object.
 * Aggregates settings from environment variables and package.json.
 */
export const config = {
  /** The name of the MCP server, derived from package.json. */
  mcpServerName: pkg.name,
  /** The version of the MCP server, derived from package.json. */
  mcpServerVersion: pkg.version,
  /** Logging level for the application (e.g., "debug", "info", "warn", "error"). Defaults to "info". */
  logLevel: process.env.LOG_LEVEL || "info",
  /** The runtime environment (e.g., "development", "production"). Defaults to "development". */
  environment: process.env.NODE_ENV || "development",
  /** Security-related configurations. */
  security: {
    // Placeholder for security settings
    // Example: authRequired: process.env.AUTH_REQUIRED === 'true'
    /** Indicates if authentication is required for server operations. */
    authRequired: false,
  },
  /** Perplexity API Key, loaded from environment variables. */
  perplexityApiKey: process.env.PERPLEXITY_API_KEY || "",
  /** Default Perplexity model to use for search-like tools. */
  perplexityDefaultModel: process.env.PERPLEXITY_DEFAULT_MODEL || "sonar-reasoning",
  /** Default Perplexity search context size ('low', 'medium', 'high'). */
  perplexityDefaultSearchContext: (process.env.PERPLEXITY_DEFAULT_SEARCH_CONTEXT || "high") as 'low' | 'medium' | 'high',
  // Note: mcpClient configuration is now loaded separately from mcp-config.json
};

// Validate search context size
const validSearchContexts: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
if (!validSearchContexts.includes(config.perplexityDefaultSearchContext)) {
  logger.warn(`Invalid PERPLEXITY_DEFAULT_SEARCH_CONTEXT: "${config.perplexityDefaultSearchContext}". Defaulting to "high".`, {
    configuredValue: config.perplexityDefaultSearchContext,
    defaultValue: "high"
  });
  config.perplexityDefaultSearchContext = "high";
}


// Add a check for the Perplexity API key after the config object is defined
if (!config.perplexityApiKey) {
  logger.warn("PERPLEXITY_API_KEY environment variable is not set. Perplexity API calls will fail.", {
    keyName: "PERPLEXITY_API_KEY"
  });
}

/**
 * The configured logging level for the application.
 * Exported separately for convenience (e.g., logger initialization).
 * @type {string}
 */
export const logLevel = config.logLevel;

/**
 * The configured runtime environment for the application.
 * Exported separately for convenience.
 * @type {string}
 */
export const environment = config.environment;

// Define valid log levels
type LogLevel = "debug" | "info" | "warn" | "error";
const validLogLevels: LogLevel[] = ["debug", "info", "warn", "error"];

// Validate the configured log level
let validatedLogLevel: LogLevel = "info"; // Default to 'info'
if (validLogLevels.includes(logLevel as LogLevel)) {
  validatedLogLevel = logLevel as LogLevel;
} else {
  logger.warn(`Invalid LOG_LEVEL: "${logLevel}". Defaulting to "info".`, {
    configuredLevel: logLevel,
    defaultLevel: validatedLogLevel
  });
}

// Initialize the logger with the validated level AFTER config is defined.
logger.initialize(validatedLogLevel);

logger.debug("Configuration loaded successfully", { config }); // Log loaded config at debug level
