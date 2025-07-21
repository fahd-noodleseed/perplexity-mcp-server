import axios, { AxiosError, AxiosInstance } from 'axios';
import { z } from 'zod';
import { config } from '../config/index.js';
import { BaseErrorCode, McpError } from '../types-global/errors.js';
import { costTracker, ErrorHandler, logger, RequestContext, sanitization } from '../utils/index.js';

// --- Zod Schemas for Validation ---

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const PerplexityModelEnum = z.enum([
    'sonar',
    'sonar-pro',
    'sonar-reasoning',
    'sonar-reasoning-pro',
    'sonar-deep-research',
]);

const ResponseFormatSchema = z.object({
    type: z.enum(['json_object']),
}).describe("Defines the format of the model's output, such as JSON.");

const WebSearchOptionsSchema = z.object({
    search_context_size: z.enum(['low', 'medium', 'high']).optional(),
    search_domain_filter: z.array(z.string()).optional(),
    search_recency_filter: z.enum(['last_day', 'last_week', 'last_month', 'last_year']).optional(),
    search_after_date_filter: z.string().optional(),
    search_before_date_filter: z.string().optional(),
}).describe("Options to control web search behavior.");

export const PerplexityChatCompletionRequestSchema = z.object({
  model: PerplexityModelEnum,
  messages: z.array(MessageSchema).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().min(0).optional(),
  stream: z.boolean().optional().default(false),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(0).optional(),
  return_images: z.boolean().optional(),
  return_related_questions: z.boolean().optional(),
  response_format: ResponseFormatSchema.optional(),
  web_search_options: WebSearchOptionsSchema.optional(),
  // Search-related parameters
  search_domain_filter: z.array(z.string()).optional(),
  search_recency_filter: z.string().optional(),
  search_after_date_filter: z.string().optional(),
  search_before_date_filter: z.string().optional(),
  search_mode: z.enum(['web', 'academic']).optional(),
  // Model-specific parameters
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional(), // For sonar-deep-research
});

export type PerplexityChatCompletionRequest = z.infer<typeof PerplexityChatCompletionRequestSchema>;

// --- Async API Response Schemas ---

const UsageSchema = z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
    search_context_size: z.string().optional(),
    citation_tokens: z.number().optional(),
    // The docs use num_search_queries, but our cost tracker expects search_queries. We'll handle this mapping.
    num_search_queries: z.number().optional(),
    reasoning_tokens: z.number().optional(),
});

const ChoiceSchema = z.object({
    index: z.number(),
    finish_reason: z.string(),
    message: MessageSchema,
    delta: z.object({ role: z.string().optional(), content: z.string().optional() }).optional(),
});

const SearchResultSchema = z.object({
    title: z.string(),
    url: z.string().url(),
    date: z.string().optional(),
});

const FinalResponsePayloadSchema = z.object({
    id: z.string(),
    model: z.string(),
    created: z.number(),
    usage: UsageSchema,
    object: z.literal('chat.completion'),
    choices: z.array(ChoiceSchema),
    citations: z.array(z.string().url()).optional(),
    search_results: z.array(SearchResultSchema).optional(),
});

export type PerplexityChatCompletionResponse = z.infer<typeof FinalResponsePayloadSchema>;

class PerplexityApiService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = config.perplexityApiKey;
    if (!this.apiKey) {
      throw new McpError(
        BaseErrorCode.CONFIGURATION_ERROR,
        'PERPLEXITY_API_KEY environment variable is not set.',
        {}
      );
    }

    this.axiosInstance = axios.create({
      baseURL: config.perplexityApiBaseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Increase timeout for potentially long-running deep research tasks
      timeout: config.perplexityPollingTimeoutMs,
    });
  }

  async chatCompletion(
    requestData: PerplexityChatCompletionRequest,
    context: RequestContext
  ): Promise<PerplexityChatCompletionResponse> {
    const operation = 'PerplexityApiService.chatCompletion';
    const sanitizedInput = sanitization.sanitizeForLogging(requestData);

    if (requestData.stream === true) {
        logger.warning(`[${operation}] Stream parameter is not supported and will be ignored.`, context);
        requestData.stream = false;
    }

    return await ErrorHandler.tryCatch(
      async () => {
        logger.info(`[${operation}] Initiating chat completion request`, { ...context, model: requestData.model });
        logger.debug(`[${operation}] Request details`, { ...context, input: sanitizedInput });

        const response = await this.axiosInstance.post<PerplexityChatCompletionResponse>(
            '/chat/completions',
            requestData
        );
        
        const finalResponse = response.data;

        logger.info(`[${operation}] Received successful final response`, { ...context, responseId: finalResponse.id });
        logger.debug(`[${operation}] Final response data`, { ...context, response: finalResponse });

        const apiTier = requestData.reasoning_effort ?? (finalResponse.usage.search_context_size as 'low' | 'medium' | 'high' | undefined);
        
        const usageForCostTracker = {
            ...finalResponse.usage,
            search_queries: finalResponse.usage.num_search_queries,
        };

        const estimatedCost = costTracker.calculatePerplexityCost(
          finalResponse.model,
          usageForCostTracker,
          apiTier,
          context
        );

        if (estimatedCost !== null) {
          logger.info(`[${operation}] Estimated API call cost: $${estimatedCost.toFixed(6)}`, { ...context, estimatedCost });
        } else {
          logger.warning(`[${operation}] Could not estimate cost for model: ${finalResponse.model}`, context);
        }

        return finalResponse;
      },
      {
        operation: operation,
        context: context,
        input: sanitizedInput,
        errorCode: BaseErrorCode.INTERNAL_ERROR,
        critical: false,
      }
    );
  }
}

export const perplexityApiService = new PerplexityApiService();
