/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_think_and_analyze` tool.
 * This tool interfaces with the Perplexity API to provide logical reasoning and analytical thinking using the sonar-reasoning-pro model.
 * @module src/mcp-server/tools/perplexityThinkAndAnalyze/logic
 */

import { z } from 'zod';
import { perplexityApiService, PerplexityChatCompletionRequest } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';

// 1. DEFINE Zod input and output schemas.
export const PerplexityThinkAndAnalyzeInputSchema = z.object({
  query: z.string().min(1).describe("The query requiring logical reasoning, analysis, or step-by-step thinking."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions in its response. Defaults to false."),
  search_recency_filter: z.string().optional().describe("Restricts the web search to a specific timeframe. Accepts 'day', 'week', 'month', 'year'."),
  search_domain_filter: z.array(z.string()).max(20).optional().describe(
    "Filter search results by domain (max 20). " +
    "ALLOWLIST (include only): ['nasa.gov', 'wikipedia.org'] - use simple domain names without https:// or www. " +
    "DENYLIST (exclude): ['-pinterest.com', '-reddit.com'] - prefix with '-' to exclude. " +
    "URL-LEVEL: ['https://example.com/specific-page'] - complete URLs to target specific pages. " +
    "SPECIAL: ['sec'] - search SEC filings (10-K, 10-Q, 8-K). " +
    "Cannot mix allowlist and denylist modes. Main domains filter all subdomains automatically."
  ),
  search_after_date_filter: z.string().optional().describe("Filters search results to content published after a specific date (MM/DD/YYYY)."),
  search_before_date_filter: z.string().optional().describe("Filters search results to content published before a specific date (MM/DD/YYYY)."),
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources."),
  showThinking: z.boolean().optional().default(false).describe("If true, includes the model's internal reasoning process in the response. Defaults to false."),
}).describe("Perform logical reasoning, analysis, and step-by-step thinking using Perplexity's sonar-reasoning-pro model. Best for complex problem-solving, mathematical calculations, code analysis, logical puzzles, and questions requiring structured thinking. Provides detailed reasoning processes and methodical analysis. (Ex. 'Analyze the algorithmic complexity of this sorting algorithm and suggest optimizations')");

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    url: z.string().url().describe("The URL of the search result."),
    date: z.string().nullable().optional().describe("The publication date of the search result. Can be null."),
});

export const PerplexityThinkAndAnalyzeResponseSchema = z.object({
    rawResultText: z.string().describe("The analytical response from the Perplexity model."),
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
export type PerplexityThinkAndAnalyzeInput = z.infer<typeof PerplexityThinkAndAnalyzeInputSchema>;
export type PerplexityThinkAndAnalyzeResponse = z.infer<typeof PerplexityThinkAndAnalyzeResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an expert analytical AI using Perplexity's advanced reasoning capabilities. Your specialty is logical thinking, step-by-step analysis, and systematic problem-solving.

**Core Directives:**

1.  **Structured Reasoning:** Break down complex problems into logical steps. Show your work and reasoning process clearly.
2.  **Analytical Depth:** Go beyond surface-level answers. Analyze underlying principles, patterns, and relationships.
3.  **Evidence-Based Logic:** Support analytical conclusions with credible sources and data when available.
4.  **Multiple Approaches:** When appropriate, consider different analytical frameworks or problem-solving methods.

**Response Structure:**

1.  **Clear Methodology:** Begin with your analytical approach or framework when tackling complex problems.
2.  **Step-by-Step Process:** Present reasoning in logical sequence with clear transitions between steps.
3.  **Evidence Integration:** Weave supporting evidence naturally into your analysis rather than listing sources separately.
4.  **Conclusion with Implications:** End with clear conclusions and discuss broader implications or applications.

**Reasoning Style:**
- Methodical and systematic in approach
- Explicit about assumptions and limitations  
- Quantitative when relevant data is available
- Considers edge cases and alternative interpretations
- Balances theoretical analysis with practical applications`;

/**
 * 3. IMPLEMENT and export the core logic function.
 * It must remain pure: its only concerns are its inputs and its return value or thrown error.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function perplexityThinkAndAnalyzeLogic(
  params: PerplexityThinkAndAnalyzeInput,
  context: RequestContext
): Promise<PerplexityThinkAndAnalyzeResponse> {
  logger.debug("Executing perplexityThinkAndAnalyzeLogic...", { ...context, toolInput: params });

  // Always use sonar-reasoning-pro for analytical thinking
  const model = 'sonar-reasoning-pro';

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

  logger.info("Calling Perplexity API with sonar-reasoning-pro model", { ...context, model });
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

  const toolResponse: PerplexityThinkAndAnalyzeResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
    searchResults: response.search_results,
  };

  logger.info("Perplexity think and analyze logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
  });

  return toolResponse;
}