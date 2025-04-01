import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";
// Removed config import to break cycle

type LogLevel = "debug" | "info" | "warn" | "error";

// Handle ESM module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to project root (2 levels up from utils/)
const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private isInitialized = false;

  private constructor() {
    // Create a basic logger initially. It will be configured later.
    this.logger = winston.createLogger({
      level: 'info', // Default level before initialization
      format: winston.format.json(),
      transports: [
        // Removed initial Console transport.
        // MCP clients (Ex. Claude Desktop) communicate over stdio/stdout and can show errors if
        // unexpected console logs are present. All logging should go to files.
      ]
    });
  }

  public initialize(logLevel: LogLevel = 'info') {
    if (this.isInitialized) {
      this.warn("Logger already initialized.");
      return;
    }

    // Ensure logs directory exists
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (error) {
      this.error("Failed to create logs directory", { 
        error: error instanceof Error ? error.message : String(error),
        path: logsDir 
      });
      // Continue without file logging if directory creation fails
      this.isInitialized = true; // Mark as initialized to prevent re-attempts
      return; 
    }

    // Common format for file transports
    const commonFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, context, stack }) => {
        const contextStr = context ? `\n  Context: ${JSON.stringify(context, null, 2)}` : "";
        const stackStr = stack ? `\n  Stack: ${stack}` : "";
        return `[${timestamp}] ${level}: ${message}${contextStr}${stackStr}`;
      })
    );

    // Configure the logger with file transports
    this.logger.configure({
      level: logLevel,
      format: winston.format.json(), // Keep default format or adjust if needed
      transports: [
        // Ensure no console transport is added here either, for the same reasons as above.
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'warn.log'),
          level: 'warn',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'info.log'),
          level: 'info',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'debug.log'),
          level: 'debug',
          format: commonFormat
        })
      ]
    });
    
    this.isInitialized = true;
    this.info("Logger initialized with file transports.", { level: logLevel });
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public debug(message: string, context?: Record<string, unknown>) {
    this.logger.debug(message, { context });
  }

  public info(message: string, context?: Record<string, unknown>) {
    this.logger.info(message, { context });
  }

  public warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(message, { context });
  }

  public error(message: string, context?: Record<string, unknown>) {
    this.logger.error(message, { context });
  }
}

export const logger = Logger.getInstance();
