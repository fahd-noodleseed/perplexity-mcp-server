/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_ask` tool.
 * This tool interfaces with the Perplexity API to provide comprehensive, multi-source answers using the sonar-pro model.
 * @module src/mcp-server/tools/perplexityAsk/logic
 */

import { z } from 'zod';
import { config } from '../../../config/index.js';
import { perplexityApiService, PerplexityChatCompletionRequest, PerplexityChatCompletionRequestSchema } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';


// 1. DEFINE Zod input and output schemas.
export const PerplexityAskInputSchema = z.object({
  query: z.string().min(1).describe("The natural language query for comprehensive research and analysis."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions in its response. Defaults to false."),
  search_recency_filter: z.string().optional().describe("Restricts the web search to a specific timeframe. Accepts 'day', 'week', 'month', 'year'."),
  search_domain_filter: z.array(z.string()).optional().describe("A list of domains to restrict or exclude from the search. (e.g. ['wikipedia.org', 'arxiv.org'])."),
  search_after_date_filter: z.string().optional().describe("Filters search results to content published after a specific date (MM/DD/YYYY)."),
  search_before_date_filter: z.string().optional().describe("Filters search results to content published before a specific date (MM/DD/YYYY)."),
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources."),
}).describe("Get comprehensive, well-researched answers from multiple sources using Perplexity's sonar-pro model. Best for complex questions requiring detailed analysis and thorough coverage of a topic. Uses multiple high-quality sources to provide authoritative answers. (Ex. 'What are the latest advancements in quantum computing and their commercial applications?')");

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    url: z.string().url().describe("The URL of the search result."),
    date: z.string().nullable().optional().describe("The publication date of the search result. Can be null."),
});

export const PerplexityAskResponseSchema = z.object({
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
export type PerplexityAskInput = z.infer<typeof PerplexityAskInputSchema>;
export type PerplexityAskResponse = z.infer<typeof PerplexityAskResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an expert research assistant using Perplexity's comprehensive search capabilities. Your mission is to provide thorough, well-researched answers by synthesizing information from multiple authoritative sources.

**Core Directives:**

1.  **Comprehensive Coverage:** Search extensively across multiple high-quality sources to provide complete, nuanced answers. Prioritize depth and breadth of coverage.
2.  **Authority & Reliability:** Focus on authoritative sources - academic papers, established publications, official documentation, and expert analyses. Critically evaluate source credibility.
3.  **Precise Citations:** Every claim must be supported with accurate inline citations. Include complete citation metadata (URL, title, publication).
4.  **Multi-Perspective Analysis:** When appropriate, present different viewpoints and synthesize conflicting information to provide balanced coverage.

**Response Format:**

1.  **Comprehensive Synthesis:** Provide detailed, well-structured answers that thoroughly address the query from multiple angles.
2.  **Clear Organization:** Use logical structure with clear sections, bullet points, or numbered lists when helpful for readability.
3.  **Expert-Level Detail:** Include relevant technical details, context, and implications that provide genuine insight.
4.  **Professional Tone:** Write as an expert addressing other experts - authoritative but accessible.`;

/**
 * 3. IMPLEMENT and export the core logic function.
 * It must remain pure: its only concerns are its inputs and its return value or thrown error.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function perplexityAskLogic(
  params: PerplexityAskInput,
  context: RequestContext
): Promise<PerplexityAskResponse> {
  logger.debug("Executing perplexityAskLogic...", { ...context, toolInput: params });

  // Always use sonar-pro for comprehensive research
  const model = 'sonar-pro';

  const requestPayload: PerplexityChatCompletionRequest = {
    model,
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

  logger.info("Calling Perplexity API with sonar-pro model", { ...context, model });
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

  const toolResponse: PerplexityAskResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
    searchResults: response.search_results,
  };

  logger.info("Perplexity ask logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
  });

  return toolResponse;
}
