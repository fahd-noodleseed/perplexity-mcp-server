/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_deep_research` tool.
 * This tool interfaces with the Perplexity API to perform exhaustive, multi-source research.
 * @module src/mcp-server/tools/perplexityDeepResearch/logic
 */

import { z } from 'zod';
import { perplexityApiService, PerplexityChatCompletionRequest } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';
import { PerplexitySearchResponseSchema } from '../perplexitySearch/logic.js';

// 1. DEFINE Zod input and output schemas.
export const PerplexityDeepResearchInputSchema = z.object({
  query: z.string().min(1).describe("The detailed research query or topic for Perplexity's deep research engine."),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().default('medium').describe("Controls the computational effort and depth of the research. 'high' provides the most thorough analysis but costs more."),
}).describe("Performs an exhaustive, multi-source research query using the Perplexity Deep Research API. This tool is for complex topics requiring in-depth analysis and report generation, not for simple questions. Use the `reasoning_effort` parameter to control the depth. (Ex. 'Create a detailed document on utilizing '@modelcontextprotocol/sdk' v1.15.0')");

// The response schema is identical to the search response, so we can reuse it.
export const PerplexityDeepResearchResponseSchema = PerplexitySearchResponseSchema;


// 2. INFER and export TypeScript types.
export type PerplexityDeepResearchInput = z.infer<typeof PerplexityDeepResearchInputSchema>;
export type PerplexityDeepResearchResponse = z.infer<typeof PerplexityDeepResearchResponseSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an expert-level AI research assistant using the Perplexity deep research engine. Your primary directive is to conduct exhaustive, multi-source research and generate detailed, well-structured, and impeccably cited reports suitable for an expert audience.

**Core Directives:**

1.  **Systematic & Exhaustive Research:** Conduct a comprehensive, multi-faceted search to build a deep and nuanced understanding of the topic. Synthesize information from a wide array of sources to ensure the final report is complete.
2.  **Source Vetting:** Apply rigorous standards to source evaluation. Prioritize primary sources, peer-reviewed literature, and authoritative contemporary reports. Scrutinize sources for bias and accuracy.
3.  **Accurate & Robust Citations:** Every piece of information, data point, or claim must be attributed with a precise, inline citation. Ensure all citation metadata (URL, title) is captured correctly and completely.

**Final Report Formatting Rules:**

1.  **Synthesize and Structure:** Your answer must be a comprehensive synthesis of the information gathered. Structure the response logically with clear headings, subheadings, and paragraphs to create a professional-grade document.
2.  **Depth and Detail:** Provide a thorough and detailed analysis. Avoid superficiality and demonstrate a deep command of the subject matter.
3.  **Clarity and Precision:** Use clear, precise, and professional language.
4.  **Stand-Alone Report:** The final answer must be a complete, stand-alone report, ready for publication. Do not include conversational filler or meta-commentary on your research process.`;

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

  const requestPayload: PerplexityChatCompletionRequest = {
    model: 'sonar-deep-research',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: params.query },
    ],
    reasoning_effort: params.reasoning_effort,
    stream: false,
  };

  logger.info("Calling Perplexity API with deep research model", { ...context, reasoningEffort: params.reasoning_effort });
  logger.debug("API Payload", { ...context, payload: requestPayload });

  const response = await perplexityApiService.chatCompletion(requestPayload, context);

  const choice = response.choices?.[0];
  const rawResultText = choice?.message?.content;

  if (!rawResultText) {
    logger.warning("Perplexity API returned empty content", { ...context, responseId: response.id });
    throw new McpError(
      BaseErrorCode.SERVICE_UNAVAILABLE,
      'Perplexity API returned an empty response.',
      { ...context, responseId: response.id }
    );
  }

  const toolResponse: PerplexityDeepResearchResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
    searchResults: response.search_results,
  };

  logger.info("Perplexity deep research logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
  });

  return toolResponse;
}
