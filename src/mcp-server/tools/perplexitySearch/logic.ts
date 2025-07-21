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

// 1. DEFINE Zod input and output schemas.
export const PerplexitySearchInputSchema = z.object({
  query: z.string().min(1).describe("The natural language query for Perplexity's search-augmented generation."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions in its response. Defaults to false."),
  search_recency_filter: z.string().optional().describe("Restricts the web search to a specific timeframe. Accepts 'day', 'week', 'month', 'year'."),
  search_domain_filter: z.array(z.string()).optional().describe("A list of domains to restrict or exclude from the search. (e.g. ['wikipedia.org', 'arxiv.org'])."),
  search_after_date_filter: z.string().optional().describe("Filters search results to content published after a specific date (MM/DD/YYYY)."),
  search_before_date_filter: z.string().optional().describe("Filters search results to content published before a specific date (MM/DD/YYYY)."),
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources."),
  showThinking: z.boolean().optional().default(false).describe("If true, includes the model's internal reasoning in the response. Defaults to false."),
}).describe("Performs a search-augmented query using the Perplexity Search API. `perplexity_search` takes a natural language query, performs a web search, and uses an LLM to synthesize an answer. Use concise, specific queries for best results; include version information if applicable. Supports filtering by recency, date, domain, and search mode (web or academic). '(Ex. 'What are the latest advancements in quantum computing?')");

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    url: z.string().url().describe("The URL of the search result."),
    date: z.string().nullable().optional().describe("The publication date of the search result. Can be null."),
});

export const PerplexitySearchResponseSchema = z.object({
    rawResultText: z.string().describe("The synthesized answer from the Perplexity model."),
    responseId: z.string().describe("The unique identifier for the Perplexity API response."),
    modelUsed: z.string().describe("The model that was used to generate the response."),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
    }).describe("Token usage details for the API call."),
    searchResults: z.array(SearchResultSchema).optional().describe("An array of web search results used to generate the response."),
});


// 2. INFER and export TypeScript types.
export type PerplexitySearchInput = z.infer<typeof PerplexitySearchInputSchema>;
export type PerplexitySearchResponse = z.infer<typeof PerplexitySearchResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an advanced AI assistant using the Perplexity search engine. Your primary directive is to provide comprehensive, accurate, and trustworthy answers based on systematic web research.

**Core Directives:**

1.  **Systematic Research:** Conduct a thorough and systematic search to gather a complete picture of the topic. Do not rely on a single source.
2.  **Source Vetting:** Critically evaluate sources for reliability, authoritativeness, and timeliness. Prioritize modern, primary sources and reputable publications.
3.  **Accurate & Robust Citations:** All claims and data points must be backed by accurate, inline citations. Ensure that the citation metadata (URL, title) is complete and correct.

**Final Answer Formatting Rules:**

1.  **Synthesize:** Base your answer *only* on the provided web search results. Do not add external knowledge.
2.  **Structure:**
    *   If the answer is best presented as a list: Write a brief, natural introductory sentence based on the original query, followed by the list items. Separate each list item with two newlines (\n\n).
    *   If the answer is a direct statement or explanation: Provide it clearly and concisely.
3.  **Clarity:** The final answer should be direct and stand alone. Do NOT explain the search process or mention intermediate steps within the final answer itself.
4.  **Focus:** Prioritize accuracy and relevance to the user's query, supported by strong evidence from your research.`;

/**
 * 3. IMPLEMENT and export the core logic function.
 * It must remain pure: its only concerns are its inputs and its return value or thrown error.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function perplexitySearchLogic(
  params: PerplexitySearchInput,
  context: RequestContext
): Promise<PerplexitySearchResponse> {
  logger.debug("Executing perplexitySearchLogic...", { ...context, toolInput: params });

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
    ...(params.return_related_questions && { return_related_questions: params.return_related_questions }),
    ...(params.search_recency_filter && { search_recency_filter: params.search_recency_filter }),
    ...(params.search_domain_filter && { search_domain_filter: params.search_domain_filter }),
    ...(params.search_after_date_filter && { search_after_date_filter: params.search_after_date_filter }),
    ...(params.search_before_date_filter && { search_before_date_filter: params.search_before_date_filter }),
    ...(params.search_mode && { search_mode: params.search_mode }),
  };

  logger.info("Calling Perplexity API", { ...context, model: modelToUse });
  logger.debug("API Payload", { ...context, payload: requestPayload });

  const response = await perplexityApiService.chatCompletion(requestPayload, context);

  const rawResultText = response.choices?.[0]?.message?.content;

  if (!rawResultText) {
    logger.warning("Perplexity API returned empty content", { ...context, responseId: response.id });
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
    searchResults: response.search_results,
  };

  logger.info("Perplexity search logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
  });

  return toolResponse;
}
