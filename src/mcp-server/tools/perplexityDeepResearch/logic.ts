/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_deep_research` tool.
 * This tool interfaces with the Perplexity API to perform exhaustive, multi-source research.
 * @module src/mcp-server/tools/perplexityDeepResearch/logic
 */

import { z } from 'zod';
import { perplexityApiService, PerplexityChatCompletionRequest } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';

// --- Input Schema Definition ---

/**
 * Defines the input parameters for the `perplexity_deep_research` tool.
 */
export const PerplexityDeepResearchInputSchema = z.object({
  query: z.string().min(1).describe("The detailed research query or topic for Perplexity's deep research engine."),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().default('medium').describe("Controls the computational effort and depth of the research. 'high' provides the most thorough analysis but costs more."),
}).describe("Defines the input parameters for the perplexity_deep_research tool, designed for complex, in-depth topics.");

/**
 * TypeScript type inferred from `PerplexityDeepResearchInputSchema`.
 */
export type PerplexityDeepResearchInput = z.infer<typeof PerplexityDeepResearchInputSchema>;

/**
 * Defines the structure of the successful response from the `perplexityDeepResearchLogic` function.
 */
export interface PerplexityDeepResearchResponse {
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

const SYSTEM_PROMPT = `You are an expert-level AI research assistant using the Perplexity deep research engine. Your purpose is to conduct exhaustive, multi-source research and generate detailed, well-structured reports.

**Final Answer Formatting Rules:**

1.  **Synthesize and Structure:** Your answer must be a comprehensive synthesis of the information gathered from multiple sources. Structure the response logically with clear headings, subheadings, and paragraphs.
2.  **Depth and Detail:** Provide a thorough and detailed analysis of the topic. Do not provide superficial answers.
3.  **Clarity and Precision:** Use clear, precise language. The final report should be suitable for an expert audience.
4.  **Stand-Alone Report:** The final answer must be a complete, stand-alone report. Do not include conversational filler or explanations of your research process.`;

// --- Core Logic Function ---

/**
 * Executes the Perplexity deep research logic.
 * @param params - Validated input data.
 * @param context - The request context for logging and tracing.
 * @returns A promise resolving to the structured Perplexity API response.
 * @throws {McpError} If the API request fails or returns an empty response.
 */
export async function perplexityDeepResearchLogic(
  params: PerplexityDeepResearchInput,
  context: RequestContext
): Promise<PerplexityDeepResearchResponse> {
  const operation = 'perplexityDeepResearchLogic';
  logger.debug(`[${operation}] Starting Perplexity deep research logic`, { ...context, toolInput: params });

  const requestPayload: PerplexityChatCompletionRequest = {
    model: 'sonar-deep-research',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: params.query },
    ],
    reasoning_effort: params.reasoning_effort,
    stream: false, // Required by the service, though ignored in async flow
  };

  logger.info(`[${operation}] Calling Perplexity API with deep research model`, { ...context, reasoningEffort: params.reasoning_effort });
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

  const toolResponse: PerplexityDeepResearchResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
  };

  logger.info(`[${operation}] Perplexity deep research logic completed successfully.`, {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
  });

  return toolResponse;
}
