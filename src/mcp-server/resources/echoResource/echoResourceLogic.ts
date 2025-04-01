import { z } from 'zod';
import { logger } from '../../../utils/logger.js';
import { RequestContext } from '../../../utils/requestContext.js'; // Import RequestContext type

/**
 * Zod schema defining the expected query parameters for the echo resource.
 * Used for validation and type inference.
 */
export const querySchema = z.object({
  /** Optional message to be echoed back in the response. */
  message: z.string().optional()
    .describe('Message to echo back in the response')
});

/**
 * TypeScript type inferred from the `querySchema`. Represents the validated query parameters.
 * @typedef {z.infer<typeof querySchema>} EchoParams
 */
export type EchoParams = z.infer<typeof querySchema>;

/**
 * Processes the core logic for the echo resource request.
 * Takes the request URI and validated parameters, then constructs the response data.
 *
 * @function processEchoResource
 * @param {URL} uri - The full URI of the incoming resource request.
 * @param {EchoParams} params - The validated query parameters for the request.
 * @param {RequestContext} context - The request context for logging and tracing.
 * @returns {{ message: string; timestamp: string; requestUri: string }} The data payload for the response.
 */
export const processEchoResource = (
  uri: URL,
  params: EchoParams,
  context: RequestContext // Add context parameter
): { message: string; timestamp: string; requestUri: string } => {
  // Extract message from params or use a default value
  const message = params.message || 'Hello from echo resource!';
  // Use the passed context for logging
  logger.debug("Processing echo resource logic", { ...context, message });

  // Prepare response data including timestamp and original URI
  return {
    message,
    timestamp: new Date().toISOString(),
    requestUri: uri.href
  };
};
