import path from 'path';
import sanitizeHtml from 'sanitize-html';
import validator from 'validator';
import { BaseErrorCode, McpError } from '../types-global/errors.js';
import { logger } from './logger.js';

/**
 * Options for path sanitization
 */
export interface PathSanitizeOptions {
  /** Restrict paths to a specific root directory */
  rootDir?: string;
  /** Normalize Windows-style paths to POSIX-style */
  toPosix?: boolean;
  /** Allow absolute paths (if false, converts to relative paths) */
  allowAbsolute?: boolean;
}

/**
 * Context-specific input sanitization options
 */
export interface SanitizeStringOptions {
  /** Handle content differently based on context */
  context?: 'text' | 'html' | 'attribute' | 'url' | 'javascript';
  /** Custom allowed tags when using html context */
  allowedTags?: string[];
  /** Custom allowed attributes when using html context */
  allowedAttributes?: Record<string, string[]>;
}

/**
 * Configuration for HTML sanitization
 */
export interface HtmlSanitizeConfig {
  /** Allowed HTML tags */
  allowedTags?: string[];
  /** Allowed HTML attributes (global or per-tag) */
  allowedAttributes?: sanitizeHtml.IOptions['allowedAttributes'];
  /** Allow preserving comments - uses allowedTags internally */
  preserveComments?: boolean;
  /** Custom URL sanitizer */
  transformTags?: sanitizeHtml.IOptions['transformTags'];
}

/**
 * Sanitization class for handling various input sanitization tasks
 */
export class Sanitization {
  private static instance: Sanitization;
  
  /** Default list of sensitive fields for sanitizing logs */
  private sensitiveFields: string[] = [
    'password', 'token', 'secret', 'key', 'apiKey', 'auth', 
    'credential', 'jwt', 'ssn', 'credit', 'card', 'cvv', 'authorization'
  ];

  /** Default sanitize-html configuration */
  private defaultHtmlSanitizeConfig: HtmlSanitizeConfig = {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 
      'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 
      'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre'
    ],
    allowedAttributes: {
      'a': ['href', 'name', 'target'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id', 'style']
    },
    preserveComments: false
  };

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    logger.debug('Sanitization service initialized with modern libraries');
  }

  /**
   * Get the singleton Sanitization instance
   * @returns Sanitization instance
   */
  public static getInstance(): Sanitization {
    if (!Sanitization.instance) {
      Sanitization.instance = new Sanitization();
    }
    return Sanitization.instance;
  }

  /**
   * Set sensitive fields for log sanitization
   * @param fields Array of field names to consider sensitive
   */
  public setSensitiveFields(fields: string[]): void {
    this.sensitiveFields = [...new Set([...this.sensitiveFields, ...fields])]; // Ensure uniqueness
    logger.debug('Updated sensitive fields list', { count: this.sensitiveFields.length });
  }

  /**
   * Get the current list of sensitive fields
   * @returns Array of sensitive field names
   */
  public getSensitiveFields(): string[] {
    return [...this.sensitiveFields];
  }

  /**
   * Sanitize HTML content using sanitize-html library
   * @param input HTML string to sanitize
   * @param config Optional custom sanitization config
   * @returns Sanitized HTML
   */
  public sanitizeHtml(input: string, config?: HtmlSanitizeConfig): string {
    if (!input) return '';
    
    // Create sanitize-html options from our config
    const options: sanitizeHtml.IOptions = {
      allowedTags: config?.allowedTags || this.defaultHtmlSanitizeConfig.allowedTags,
      allowedAttributes: config?.allowedAttributes || this.defaultHtmlSanitizeConfig.allowedAttributes,
      transformTags: config?.transformTags
    };
    
    // Handle comments - if preserveComments is true, add '!--' to allowedTags
    if (config?.preserveComments || this.defaultHtmlSanitizeConfig.preserveComments) {
      options.allowedTags = [...(options.allowedTags || []), '!--'];
    }
    
    return sanitizeHtml(input, options);
  }

  /**
   * Sanitize string input based on context.
   *
   * **Important:** Using `context: 'javascript'` is explicitly disallowed and will throw an `McpError`.
   * This is a security measure to prevent accidental execution or ineffective sanitization of JavaScript code.
   *
   * @param input String to sanitize
   * @param options Sanitization options
   * @returns Sanitized string
   * @throws {McpError} If `context: 'javascript'` is used.
   */
  public sanitizeString(input: string, options: SanitizeStringOptions = {}): string {
    if (!input) return '';
    
    // Handle based on context
    switch (options.context) {
      case 'html':
        // Use sanitize-html with custom options
        return this.sanitizeHtml(input, {
          allowedTags: options.allowedTags,
          allowedAttributes: options.allowedAttributes ? 
            this.convertAttributesFormat(options.allowedAttributes) : 
            undefined
        });
          
      case 'attribute':
        // Strip HTML tags for attribute context
        return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
          
      case 'url':
        // Validate and sanitize URL
        if (!validator.isURL(input, { 
          protocols: ['http', 'https'],
          require_protocol: true
        })) {
          // Return empty string for invalid URLs in this context
          logger.warn('Invalid URL detected during string sanitization', { input });
          return ''; 
        }
        return validator.trim(input);
        
      case 'javascript':
        // Reject any attempt to sanitize JavaScript
        logger.error('Attempted JavaScript sanitization via sanitizeString', { input: input.substring(0, 50) });
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          'JavaScript sanitization not supported through string sanitizer'
        );
        
      case 'text':
      default:
        // Strip HTML tags for basic text context
        return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
    }
  }

  /**
   * Sanitize URL with robust validation and sanitization
   * @param input URL to sanitize
   * @param allowedProtocols Allowed URL protocols
   * @returns Sanitized URL
   * @throws {McpError} If URL is invalid
   */
  public sanitizeUrl(input: string, allowedProtocols: string[] = ['http', 'https']): string {
    try {
      // First validate the URL format
      if (!validator.isURL(input, { 
        protocols: allowedProtocols,
        require_protocol: true 
      })) {
        throw new Error('Invalid URL format or protocol');
      }
      
      // Double-check no javascript: protocol sneaked in
      const lowerInput = input.toLowerCase().trim();
      if (lowerInput.startsWith('javascript:')) {
        throw new Error('JavaScript protocol not allowed');
      }
      
      // Return the trimmed, validated URL
      return validator.trim(input);
    } catch (error) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error ? error.message : 'Invalid URL format',
        { input }
      );
    }
  }

  /**
   * Sanitize file paths to prevent path traversal attacks
   * @param input Path to sanitize
   * @param options Options for path sanitization
   * @returns Sanitized and normalized path
   * @throws {McpError} If path is invalid or unsafe
   */
  public sanitizePath(input: string, options: PathSanitizeOptions = {}): string {
    try {
      if (!input || typeof input !== 'string') {
        throw new Error('Invalid path input: must be a non-empty string');
      }
      
      // Apply path normalization using built-in path module
      let normalized = path.normalize(input);
      
      // Prevent null byte injection
      if (normalized.includes('\0')) {
        throw new Error('Path contains null byte');
      }
      
      // Convert backslashes to forward slashes if toPosix is true
      if (options.toPosix) {
        normalized = normalized.replace(/\\/g, '/');
      }
      
      // Handle absolute paths based on allowAbsolute option
      if (!options.allowAbsolute && path.isAbsolute(normalized)) {
        // Remove leading slash or drive letter to make it relative
        normalized = normalized.replace(/^(?:[A-Za-z]:)?[/\\]/, '');
      }
      
      // If rootDir is specified, ensure the path doesn't escape it
      if (options.rootDir) {
        const rootDir = path.resolve(options.rootDir);
        
        // Resolve the normalized path against the root dir
        const fullPath = path.resolve(rootDir, normalized);
        
        // More robust check for path traversal: ensure fullPath starts with rootDir + separator
        // or is exactly rootDir
        if (!fullPath.startsWith(rootDir + path.sep) && fullPath !== rootDir) {
          throw new Error('Path traversal detected');
        }
        
        // Return the path relative to the root
        return path.relative(rootDir, fullPath);
      }
      
      // Final validation - check for relative path traversal attempts if not rooted
      if (normalized.includes('..')) {
         // Resolve the path to see if it escapes the current working directory conceptually
         const resolvedPath = path.resolve(normalized);
         const currentWorkingDir = path.resolve('.'); // Or use a safer base if needed
         if (!resolvedPath.startsWith(currentWorkingDir)) {
            throw new Error('Relative path traversal detected');
         }
      }
      
      return normalized;
    } catch (error) {
      logger.warn('Path sanitization error', { 
        input, 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error ? error.message : 'Invalid or unsafe path',
        { input }
      );
    }
  }
  
  /**
   * Sanitize a JSON string
   * @param input JSON string to sanitize
   * @param maxSize Maximum allowed size in bytes
   * @returns Parsed and sanitized object
   * @throws {McpError} If JSON is invalid or too large
   */
  public sanitizeJson<T = unknown>(input: string, maxSize?: number): T {
    try {
      if (typeof input !== 'string') {
        throw new Error('Invalid input: expected a JSON string');
      }
      
      // Check size limit if specified
      if (maxSize !== undefined && Buffer.byteLength(input, 'utf8') > maxSize) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `JSON exceeds maximum allowed size of ${maxSize} bytes`,
          { size: Buffer.byteLength(input, 'utf8'), maxSize }
        );
      }
      
      // Validate JSON format using JSON.parse for stricter validation than validator.isJSON
      const parsed = JSON.parse(input);
      
      // Optional: Add recursive sanitization of parsed object values if needed
      // this.sanitizeObjectRecursively(parsed); 
      
      return parsed as T;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        error instanceof Error ? error.message : 'Invalid JSON format',
        { input: input.length > 100 ? `${input.substring(0, 100)}...` : input }
      );
    }
  }
  
  /**
   * Ensure input is within a numeric range
   * @param input Number or string to validate
   * @param min Minimum allowed value (inclusive)
   * @param max Maximum allowed value (inclusive)
   * @returns Sanitized number within range
   * @throws {McpError} If input is not a valid number
   */
  public sanitizeNumber(input: number | string, min?: number, max?: number): number {
    let value: number;
    
    // Handle string input
    if (typeof input === 'string') {
      // Use validator for initial check, but rely on parseFloat for conversion
      if (!validator.isNumeric(input.trim())) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          'Invalid number format',
          { input }
        );
      }
      value = parseFloat(input.trim());
    } else if (typeof input === 'number') {
      value = input;
    } else {
       throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          'Invalid input type: expected number or string',
          { input: String(input) }
        );
    }
    
    // Check if parsing resulted in NaN
    if (isNaN(value) || !isFinite(value)) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Invalid number value (NaN or Infinity)',
        { input }
      );
    }
    
    // Clamp the value to the specified range
    if (min !== undefined && value < min) {
      value = min;
      logger.debug('Number clamped to minimum value', { input, min, value });
    }
    
    if (max !== undefined && value > max) {
      value = max;
      logger.debug('Number clamped to maximum value', { input, max, value });
    }
    
    return value;
  }

  /**
   * Sanitize input for logging to protect sensitive information
   * @param input Input to sanitize
   * @returns Sanitized input safe for logging
   */
  public sanitizeForLogging(input: unknown): unknown {
    try {
      // Handle non-objects and null directly
      if (!input || typeof input !== 'object') {
        return input;
      }
      
      // Use structuredClone for deep copy if available (Node.js >= 17)
      // Fallback to JSON stringify/parse for older versions
      const clonedInput = typeof structuredClone === 'function' 
        ? structuredClone(input)
        : JSON.parse(JSON.stringify(input));
          
      // Recursively sanitize the cloned object
      this.redactSensitiveFields(clonedInput);
      
      return clonedInput;
    } catch (error) {
      logger.error('Error during log sanitization', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Return a placeholder if sanitization fails
      return '[Log Sanitization Failed]';
    }
  }

  /**
   * Private helper to convert attribute format from record to sanitize-html format
   */
  private convertAttributesFormat(attrs: Record<string, string[]>): sanitizeHtml.IOptions['allowedAttributes'] {
    // sanitize-html directly supports Record<string, string[]> for allowedAttributes per tag
    return attrs;
  }

  /**
   * Recursively redact sensitive fields in an object or array
   */
  private redactSensitiveFields(obj: unknown): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    
    // Handle arrays: iterate and recurse
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        // If the item is an object/array, recurse. Otherwise, leave primitive values.
        if (item && typeof item === 'object') {
          this.redactSensitiveFields(item);
        }
      });
      return;
    }
    
    // Handle regular objects: iterate through keys
    for (const key in obj) {
      // Use hasOwnProperty to avoid iterating over prototype properties
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        
        // Check if this key matches any sensitive field pattern (case-insensitive)
        const isSensitive = this.sensitiveFields.some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        );
        
        if (isSensitive) {
          // Mask sensitive value
          (obj as Record<string, unknown>)[key] = '[REDACTED]';
        } else if (value && typeof value === 'object') {
          // Recursively process nested objects/arrays
          this.redactSensitiveFields(value);
        }
        // Primitive values are left as is if not sensitive
      }
    }
  }
}

// Create and export singleton instance
export const sanitization = Sanitization.getInstance();

// Removed the `sanitizeInput` object export for simplicity.
// Users should import `sanitization` and call methods directly.
// e.g., import { sanitization } from './sanitization.js';
// sanitization.sanitizeHtml(input);
// sanitization.sanitizePath(input);

/**
 * Sanitize input for logging to protect sensitive information.
 * Kept as a separate export for convenience.
 * @param input Input to sanitize
 * @returns Sanitized input safe for logging
 */
export const sanitizeInputForLogging = (input: unknown): unknown => 
  sanitization.sanitizeForLogging(input);

// Removed default export
