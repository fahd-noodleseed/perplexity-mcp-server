/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_deep_research` tool.
 * This tool interfaces with the Perplexity API to perform exhaustive multi-source research using the sonar-deep-research model.
 * @module src/mcp-server/tools/perplexityDeepResearch/logic
 */

import { z } from 'zod';
import { config } from '../../../config/index.js';
import { perplexityApiService, PerplexityChatCompletionRequest, PerplexityChatCompletionRequestSchema } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';


// 1. DEFINE Zod input and output schemas.
export const PerplexityDeepResearchInputSchema = z.object({
  query: z.string().min(1).describe("The research question or topic for exhaustive multi-source analysis. This tool will perform 10-20+ searches and synthesize findings into a comprehensive research report."),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().default('medium').describe("Controls the computational depth and thoroughness of the research. 'low' for faster/cheaper results, 'medium' for balanced analysis (default), 'high' for most comprehensive deep research with increased reasoning tokens."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions for further research. Defaults to false."),
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
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources for research-grade analysis."),
}).describe("Perform exhaustive, multi-source deep research with expert-level insights using Perplexity's sonar-deep-research model. Best for academic research, market analysis, competitive intelligence, due diligence, and complex questions requiring comprehensive investigation across hundreds of sources. Returns detailed research reports with transparent reasoning. (Ex. 'Conduct comprehensive analysis of quantum computing industry including technological approaches, key players, market opportunities, and commercial viability through 2035.')");

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    url: z.string().url().describe("The URL of the search result."),
    date: z.string().nullable().optional().describe("The publication date of the search result. Can be null."),
    last_updated: z.string().nullable().optional().describe("The last update date of the search result. Can be null."),
    snippet: z.string().optional().describe("A relevant text excerpt from the source providing context."),
});

const CostBreakdownSchema = z.object({
    input_tokens_cost: z.number().describe("Cost incurred for input tokens."),
    output_tokens_cost: z.number().describe("Cost incurred for output tokens."),
    citation_tokens_cost: z.number().describe("Cost incurred for citation processing tokens."),
    reasoning_tokens_cost: z.number().describe("Cost incurred for internal reasoning computation tokens."),
    search_queries_cost: z.number().describe("Cost incurred for search query executions."),
    total_cost: z.number().describe("Total cost for the deep research request."),
});

export const PerplexityDeepResearchResponseSchema = z.object({
    rawResultText: z.string().describe("The comprehensive research report including <think> blocks showing the model's reasoning process."),
    responseId: z.string().describe("The unique identifier for the Perplexity API response."),
    modelUsed: z.string().describe("The model that was used (sonar-deep-research)."),
    createdTimestamp: z.number().describe("Unix timestamp when the response was created."),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
        citation_tokens: z.number().optional(),
        reasoning_tokens: z.number().optional(),
        num_search_queries: z.number().optional(),
    }).describe("Token usage and search metrics for the API call."),
    costBreakdown: CostBreakdownSchema.optional().describe("Itemized cost breakdown from the API response."),
    searchResults: z.array(SearchResultSchema).optional().describe("An array of web search results used to generate the research report, including snippets."),
    citations: z.array(z.string()).optional().describe("Array of citation URLs referenced in the research report."),
    estimatedCost: z.number().optional().describe("Calculated API call cost (can be validated against costBreakdown.total_cost)."),
});


// 2. INFER and export TypeScript types.
export type PerplexityDeepResearchInput = z.infer<typeof PerplexityDeepResearchInputSchema>;
export type PerplexityDeepResearchResponse = z.infer<typeof PerplexityDeepResearchResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an elite research analyst conducting exhaustive deep research using Perplexity's advanced search capabilities. Your mission is to perform comprehensive, multi-source investigation and deliver expert-level research reports with unprecedented depth and rigor.

**Core Research Directives:**

1.  **Exhaustive Multi-Source Investigation:** Conduct extensive searches across hundreds of authoritative sources. Leave no stone unturned in gathering relevant information from academic papers, industry reports, expert analyses, official documentation, and established publications.

2.  **Expert-Level Synthesis:** Synthesize findings into coherent, comprehensive research reports that rival professional consulting deliverables. Connect disparate information, identify patterns, and extract insights that go beyond surface-level summaries.

3.  **Rigorous Source Evaluation:** Prioritize the highest-quality sources available. Cross-reference claims across multiple authoritative sources. Flag contradictions and evaluate conflicting evidence critically.

4.  **Transparent Reasoning:** Expose your research strategy, analytical approach, and decision-making process. Show how you structure investigations, prioritize sources, and arrive at conclusions.

5.  **Multi-Perspective Analysis:** Present comprehensive viewpoints, competing theories, and alternative interpretations. Acknowledge uncertainty and limitations in available evidence.

**Research Report Structure:**

1.  **Executive Summary:** Lead with key findings and high-level insights for quick orientation.
2.  **Comprehensive Analysis:** Provide detailed examination organized into logical sections with clear hierarchies.
3.  **Evidence-Based Argumentation:** Support every claim with specific citations. Include quantitative data, expert quotes, and concrete examples.
4.  **Critical Evaluation:** Assess strengths and weaknesses of different approaches, identify gaps in current knowledge, and highlight areas requiring further investigation.
5.  **Expert-Level Detail:** Include technical specifics, methodological considerations, and implementation details that provide actionable insights.

**Quality Standards:**

- Write for expert audiences with domain knowledge
- Maintain academic rigor and professional standards
- Provide comprehensive coverage worthy of professional research reports
- Deliver genuine insights beyond what's easily accessible through simple searches`;

/**
 * 3. IMPLEMENT and export the core logic function.
 * It must remain pure: its only concerns are its inputs and its return value or thrown error.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function perplexityDeepResearchLogic(
  params: PerplexityDeepResearchInput,
  context: RequestContext
): Promise<PerplexityDeepResearchResponse> {
  logger.debug("Executing perplexityDeepResearchLogic...", { ...context, toolInput: params });

  // Always use sonar-deep-research model for exhaustive research
  const model = 'sonar-deep-research';

  const requestPayload: PerplexityChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: params.query },
    ],
    stream: false,
    ...(params.reasoning_effort && { reasoning_effort: params.reasoning_effort }),
    ...(params.return_related_questions && { return_related_questions: params.return_related_questions }),
    ...(params.search_recency_filter && { search_recency_filter: params.search_recency_filter }),
    ...(params.search_domain_filter && { search_domain_filter: params.search_domain_filter }),
    ...(params.search_after_date_filter && { search_after_date_filter: params.search_after_date_filter }),
    ...(params.search_before_date_filter && { search_before_date_filter: params.search_before_date_filter }),
    ...(params.search_mode && { search_mode: params.search_mode }),
  };

  logger.info("Calling Perplexity API with sonar-deep-research model", {
    ...context,
    model,
    reasoning_effort: params.reasoning_effort || 'medium'
  });
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

  // Extract cost breakdown if available
  const costBreakdown = (response.usage as any)?.cost ? {
    input_tokens_cost: (response.usage as any).cost.input_tokens_cost,
    output_tokens_cost: (response.usage as any).cost.output_tokens_cost,
    citation_tokens_cost: (response.usage as any).cost.citation_tokens_cost,
    reasoning_tokens_cost: (response.usage as any).cost.reasoning_tokens_cost,
    search_queries_cost: (response.usage as any).cost.search_queries_cost,
    total_cost: (response.usage as any).cost.total_cost,
  } : undefined;

  const toolResponse: PerplexityDeepResearchResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    createdTimestamp: (response as any).created || Date.now(),
    usage: {
      ...response.usage,
      citation_tokens: (response.usage as any).citation_tokens,
      reasoning_tokens: (response.usage as any).reasoning_tokens,
      num_search_queries: (response.usage as any).num_search_queries,
    },
    costBreakdown,
    searchResults: response.search_results,
    citations: (response as any).citations,
    estimatedCost: costBreakdown?.total_cost,
  };

  logger.info("Perplexity deep research logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
    citationCount: toolResponse.citations?.length ?? 0,
    hasThinkBlocks: rawResultText.includes('<think>'),
    totalCost: costBreakdown?.total_cost,
  });

  return toolResponse;
}
