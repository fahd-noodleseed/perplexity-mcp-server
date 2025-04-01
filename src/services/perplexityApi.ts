import axios, { AxiosError, AxiosInstance } from 'axios';
import { z } from 'zod';
import { config } from '../config/index.js';
import { BaseErrorCode, McpError } from '../types-global/errors.js';
import { costTracker } from '../utils/costTracker.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { RequestContext } from '../utils/requestContext.js';
import { sanitization } from '../utils/sanitization.js';

// --- Zod Schemas for Validation ---

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const WebSearchOptionsSchema = z.object({
  search_context_size: z.enum(['low', 'medium', 'high']).optional(),
}).optional();

const ResponseFormatSchema = z.object({
  // Define structure if known, otherwise allow any object
  // Example: type: z.literal('json_object').optional()
}).optional();

export const PerplexityChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  search_domain_filter: z.array(z.string()).optional(),
  return_images: z.boolean().optional(),
  return_related_questions: z.boolean().optional(),
  search_recency_filter: z.string().optional(), // Consider enum if specific values known
  top_k: z.number().int().min(0).optional(),
  stream: z.boolean().optional().default(false), // Default to false as we handle full responses
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(0).optional(), // API doc says >0, but default is 1, allowing 0 might be safer
  response_format: ResponseFormatSchema,
  web_search_options: WebSearchOptionsSchema,
});

// Type inferred from the schema
export type PerplexityChatCompletionRequest = z.infer<typeof PerplexityChatCompletionRequestSchema>;

// Define a basic structure for the response, focusing on usage data for cost tracking
// Adjust based on actual API response structure as needed
export interface PerplexityChatCompletionResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: 'assistant';
      content: string;
    };
    delta?: { // For streaming, though we don't handle it here yet
      role?: 'assistant';
      content?: string;
    };
  }>;
  // Include other fields as necessary based on the API documentation or observed responses
  // e.g., search_results, related_questions if requested
}


class PerplexityApiService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private readonly apiBaseUrl = 'https://api.perplexity.ai';

  constructor() {
    this.apiKey = config.perplexityApiKey;
    if (!this.apiKey) {
      // Throw immediately during instantiation if API key is missing
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        'PERPLEXITY_API_KEY environment variable is not set.',
        {} // No context available yet
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 60000, // 60 second timeout
    });
  }

  /**
   * Calls the Perplexity Chat Completions API.
   * @param requestData - The validated request data conforming to PerplexityChatCompletionRequest.
   * @param context - The request context for logging and error tracking.
   * @returns The Perplexity API response.
   * @throws {McpError} If the API call fails or returns an error.
   */
  async chatCompletion(
    requestData: PerplexityChatCompletionRequest,
    context: RequestContext
  ): Promise<PerplexityChatCompletionResponse> {
    const operation = 'PerplexityApiService.chatCompletion';
    const sanitizedInput = sanitization.sanitizeForLogging(requestData);

    logger.info(`[${operation}] Initiating chat completion request`, { ...context, model: requestData.model });
    logger.debug(`[${operation}] Request details`, { ...context, input: sanitizedInput });

    // Ensure stream is false, as this service handles full responses
    if (requestData.stream === true) {
        logger.warn(`[${operation}] Stream parameter was true, forcing to false for non-streaming service`, context);
        requestData.stream = false;
    }

    return await ErrorHandler.tryCatch(
      async () => {
        try {
          const response = await this.axiosInstance.post<PerplexityChatCompletionResponse>(
            '/chat/completions',
            requestData // Send validated data
          );

          logger.info(`[${operation}] Received successful response from Perplexity API`, { ...context, model: requestData.model, responseId: response.data.id });
          logger.debug(`[${operation}] Response data`, { ...context, response: response.data }); // Log full response at debug level

          // Calculate and log cost
          const estimatedCost = costTracker.calculatePerplexityCost(
            response.data.model,
            response.data.usage,
            null, // searchMode - not directly available, pass null
            context
          );
          if (estimatedCost !== null) {
            logger.info(`[${operation}] Estimated API call cost: $${estimatedCost.toFixed(6)}`, { ...context, estimatedCost });
          } else {
            logger.warn(`[${operation}] Could not estimate cost for model: ${response.data.model}`, context);
          }

          return response.data;

        } catch (error) {
          let errorCode = BaseErrorCode.INTERNAL_ERROR; // Default to internal error
          let errorMessage = 'Perplexity API request failed.';

          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>;
            errorMessage = `Perplexity API Error: ${axiosError.response?.status} ${axiosError.response?.statusText}. ${axiosError.response?.data?.error?.message || axiosError.message}`;
            if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
              errorCode = BaseErrorCode.TIMEOUT; // Corrected: TIMEOUT_ERROR -> TIMEOUT
              errorMessage = 'Perplexity API request timed out.';
            } else if (!axiosError.response) {
              // Use SERVICE_UNAVAILABLE for generic network issues where the API might be unreachable
              errorCode = BaseErrorCode.SERVICE_UNAVAILABLE;
              errorMessage = `Perplexity API network error: ${axiosError.message}`;
            } else if (axiosError.response.status === 401) {
              errorCode = BaseErrorCode.UNAUTHORIZED; // Corrected: AUTHENTICATION_ERROR -> UNAUTHORIZED
              errorMessage = 'Perplexity API authentication failed. Check API key.';
            } else if (axiosError.response.status === 403) {
              errorCode = BaseErrorCode.FORBIDDEN; // Added check for 403 Forbidden
              errorMessage = 'Perplexity API access forbidden. Check permissions or plan.';
            } else if (axiosError.response.status === 429) {
              errorCode = BaseErrorCode.RATE_LIMITED; // Corrected: RATE_LIMIT_ERROR -> RATE_LIMITED
              errorMessage = 'Perplexity API rate limit exceeded.';
            } else if (axiosError.response.status >= 400 && axiosError.response.status < 500) {
              errorCode = BaseErrorCode.VALIDATION_ERROR; // Keep as VALIDATION_ERROR for client-side errors
              errorMessage = `Perplexity API client error (${axiosError.response.status}): ${axiosError.response?.data?.error?.message || axiosError.message}`;
            }
            logger.error(`[${operation}] Axios error details`, { ...context, status: axiosError.response?.status, data: axiosError.response?.data, message: axiosError.message });
          } else if (error instanceof Error) {
            errorMessage = `Unexpected error during Perplexity API call: ${error.message}`;
            errorCode = BaseErrorCode.INTERNAL_ERROR; // Default for unexpected errors
          }

          // Combine context and original error into details
          const errorDetails = {
            ...(context || {}), // Spread context if it exists
            originalError: error instanceof Error ? { name: error.name, message: error.message } : String(error),
            // Optionally include more details from axios error if needed
            axiosResponseStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
          };

          // Throw standardized McpError with 3 arguments
          throw new McpError(errorCode, errorMessage, errorDetails);
        }
      },
      {
        operation: operation, // Use named property for clarity
        context: context,
        input: sanitizedInput, // Log sanitized input on error
        errorCode: BaseErrorCode.INTERNAL_ERROR, // Corrected default error code
        critical: false, // API errors are usually not critical to the server itself
      }
    );
  }
}

// Export a singleton instance
export const perplexityApiService = new PerplexityApiService();
