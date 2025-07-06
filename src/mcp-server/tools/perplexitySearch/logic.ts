/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_search` tool.
 * This tool interfaces with the Perplexity API to provide search-augmented answers.
 * @module src/mcp-server/tools/perplexitySearch/logic
 */

import { z } from 'zod';
import { config } from '../../../config/index.js';
import { perplexityApiService, PerplexityChatCompletionRequest, PerplexityChatCompletionRequestSchema } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';

// --- Input Schema Definition ---

/**
 * Defines the input parameters for the `perplexity_search` tool.
 */
export const PerplexitySearchInputSchema = z.object({
  query: z.string().min(1).describe("The natural language query for Perplexity's search-augmented generation."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions in its response. Defaults to false."),
  search_recency_filter: z.string().optional().describe("Restricts the web search to a specific timeframe. Accepts 'day', 'week', 'month', 'year'."),
  search_domain_filter: z.array(z.string()).optional().describe("A list of domains to restrict or exclude from the search. (e.g. ['wikipedia.org', 'arxiv.org'])."),
  search_after_date_filter: z.string().optional().describe("Filters search results to content published after a specific date (MM/DD/YYYY)."),
  search_before_date_filter: z.string().optional().describe("Filters search results to content published before a specific date (MM/DD/YYYY)."),
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources."),
  showThinking: z.boolean().optional().default(false).describe("If true, includes the model's internal reasoning in the response. Defaults to false."),
}).describe("Defines the input parameters for the perplexity_search tool.");

/**
 * TypeScript type inferred from `PerplexitySearchInputSchema`.
 */
export type PerplexitySearchInput = z.infer<typeof PerplexitySearchInputSchema>;

/**
 * Defines the structure of the successful response from the `perplexitySearchLogic` function.
 */
export interface PerplexitySearchResponse {
  rawResultText: string;
  responseId: string;
  modelUsed: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// --- System Prompt ---

const SYSTEM_PROMPT = `You are an advanced AI assistant using the Perplexity engine. Your goal is to provide accurate, concise answers based on web search results.

**Final Answer Formatting Rules:**

1.  **Synthesize:** Base your answer *only* on the provided web search results. Do not add external knowledge.
2.  **Structure:**
    *   If the answer is best presented as a list: Write a brief, natural introductory sentence based on the original query, followed by the list items. Separate each list item with two newlines (\n\n).
    *   If the answer is a direct statement or explanation: Provide it clearly and concisely.
3.  **Clarity:** The final answer should be direct and stand alone. Do NOT explain the search process or mention intermediate steps within the final answer itself.
4.  **Focus:** Prioritize accuracy and relevance to the user's query.`;

// --- Core Logic Function ---

/**
 * Executes the Perplexity search logic.
 * @param params - Validated input data.
 * @param context - The request context for logging and tracing.
 * @returns A promise resolving to the structured Perplexity API response.
 * @throws {McpError} If the API request fails or returns an empty response.
 */
export async function perplexitySearchLogic(
  params: PerplexitySearchInput,
  context: RequestContext
): Promise<PerplexitySearchResponse> {
  const operation = 'perplexitySearchLogic';
  logger.debug(`[${operation}] Starting Perplexity search logic`, { ...context, toolInput: params });

  // Validate that the configured default model is a valid enum member
  const modelValidation = PerplexityChatCompletionRequestSchema.shape.model.safeParse(config.perplexityDefaultModel);
  if (!modelValidation.success) {
    throw new McpError(
      BaseErrorCode.CONFIGURATION_ERROR,
      `Invalid Perplexity default model configured: ${config.perplexityDefaultModel}`,
      { ...context, error: modelValidation.error }
    );
  }
  const modelToUse = modelValidation.data;

  const requestPayload: PerplexityChatCompletionRequest = {
    model: modelToUse,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: params.query },
    ],
    stream: false,
    // Pass all relevant, validated parameters directly
    ...(params.return_related_questions && { return_related_questions: params.return_related_questions }),
    ...(params.search_recency_filter && { search_recency_filter: params.search_recency_filter }),
    ...(params.search_domain_filter && { search_domain_filter: params.search_domain_filter }),
    ...(params.search_after_date_filter && { search_after_date_filter: params.search_after_date_filter }),
    ...(params.search_before_date_filter && { search_before_date_filter: params.search_before_date_filter }),
    ...(params.search_mode && { search_mode: params.search_mode }),
  };

  logger.info(`[${operation}] Calling Perplexity API`, { ...context, model: modelToUse });
  logger.debug(`[${operation}] API Payload`, { ...context, payload: requestPayload });

  const response = await perplexityApiService.chatCompletion(requestPayload, context);

  const rawResultText = response.choices?.[0]?.message?.content;

  if (!rawResultText) {
    logger.warning(`[${operation}] Perplexity API returned empty content`, { ...context, responseId: response.id });
    throw new McpError(
      BaseErrorCode.SERVICE_UNAVAILABLE,
      'Perplexity API returned an empty response.',
      { ...context, responseId: response.id }
    );
  }

  const toolResponse: PerplexitySearchResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
  };

  logger.info(`[${operation}] Perplexity search logic completed successfully.`, {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
  });

  return toolResponse;
}
