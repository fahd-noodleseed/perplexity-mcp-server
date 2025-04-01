import { z } from 'zod'; // Import z here
import { logger } from "../../../utils/logger.js";
import { RequestContext } from '../../../utils/requestContext.js'; // Import RequestContext type

// --- Schema and Type Definitions (Moved from types.ts) ---

/**
 * Defines the valid formatting modes for the echo tool operation.
 * - `standard`: Echo the message as is.
 * - `uppercase`: Convert the message to uppercase.
 * - `lowercase`: Convert the message to lowercase.
 */
export const ECHO_MODES = ['standard', 'uppercase', 'lowercase'] as const;

/**
 * Zod schema defining the input parameters for the `echo_message` tool.
 * Includes validation rules and descriptions for each parameter.
 */
export const EchoToolInputSchema = z.object({
  /** The message to be echoed back. Must be between 1 and 1000 characters. */
  message: z.string().min(1, "Message cannot be empty").max(1000, "Message cannot exceed 1000 characters").describe(
    'The message to echo back (1-1000 characters)'
  ),
  /** Specifies how the message should be formatted. Defaults to 'standard'. */
  mode: z.enum(ECHO_MODES).optional().default('standard').describe(
    'How to format the echoed message: standard (as-is), uppercase, or lowercase'
  ),
  /** The number of times the formatted message should be repeated. Defaults to 1, max 10. */
  repeat: z.number().int().min(1).max(10).optional().default(1).describe(
    'Number of times to repeat the message (1-10)'
  ),
  /** Whether to include an ISO 8601 timestamp in the response. Defaults to true. */
  timestamp: z.boolean().optional().default(true).describe(
    'Whether to include a timestamp in the response'
  )
}).describe(
  'Defines the input arguments for the echo_message tool.'
);

/**
 * TypeScript type inferred from `EchoToolInputSchema`.
 * Represents the validated input parameters for the echo tool.
 * @typedef {z.infer<typeof EchoToolInputSchema>} EchoToolInput
 */
export type EchoToolInput = z.infer<typeof EchoToolInputSchema>;

/**
 * Defines the structure of the JSON payload returned by the `echo_message` tool handler.
 * This object is JSON-stringified and placed within the `text` field of the
 * `CallToolResult`'s `content` array.
 */
export interface EchoToolResponse {
  /** The original message provided in the input. */
  originalMessage: string;
  /** The message after applying the specified formatting mode. */
  formattedMessage: string;
  /** The formatted message repeated the specified number of times, joined by spaces. */
  repeatedMessage: string;
  /** The formatting mode that was applied ('standard', 'uppercase', or 'lowercase'). */
  mode: typeof ECHO_MODES[number];
  /** The number of times the message was repeated. */
  repeatCount: number;
  /** Optional ISO 8601 timestamp indicating when the response was generated. Included if `timestamp` input was true. */
  timestamp?: string;
}

// --- Core Logic Function ---

/**
 * Processes the core logic for the echo tool.
 * Formats and repeats the message based on the provided parameters.
 *
 * @function processEchoMessage
 * @param {EchoToolInput} params - The validated input parameters for the echo tool.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @returns {EchoToolResponse} The processed response data, including original message, formatted/repeated message, and optional timestamp.
 */
export const processEchoMessage = (
  params: EchoToolInput,
  context: RequestContext // Add context parameter
): EchoToolResponse => {
  // Use the passed context for logging
  logger.debug("Processing echo message logic", { ...context, inputMessage: params.message, mode: params.mode });

  // Process the message according to the requested mode
  let formattedMessage = params.message;
  switch (params.mode) {
    case 'uppercase':
      formattedMessage = params.message.toUpperCase();
      break;
    case 'lowercase':
      formattedMessage = params.message.toLowerCase();
      break;
    // 'standard' mode keeps the message as-is
  }

  // Repeat the message the specified number of times, ensuring it's within bounds
  // Use nullish coalescing for default repeat value from schema
  const safeRepeatCount = Math.min(params.repeat ?? 1, 10);
  const repeatedMessage = Array(safeRepeatCount)
    .fill(formattedMessage)
    .join(' ');

  // Prepare the response data using the imported EchoToolResponse type
  const response: EchoToolResponse = {
    originalMessage: params.message,
    formattedMessage,
    repeatedMessage,
    // Use nullish coalescing for default mode value from schema
    mode: params.mode ?? 'standard',
    repeatCount: safeRepeatCount
  };

  // Add timestamp if requested (default is true based on schema)
  if (params.timestamp !== false) {
    response.timestamp = new Date().toISOString();
  }

  // Use the passed context for logging the result
  logger.debug("Echo message processed successfully", { ...context, response });
  return response;
};
