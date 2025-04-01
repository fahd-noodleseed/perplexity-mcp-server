import { z } from 'zod';
import { config } from '../../../config/index.js'; // Corrected path
import { perplexityApiService, PerplexityChatCompletionRequest } from '../../../services/index.js'; // Corrected path
import { BaseErrorCode, McpError } from '../../../types-global/errors.js'; // Corrected path
import { ErrorHandler } from '../../../utils/errorHandler.js'; // Corrected path
import { logger } from '../../../utils/logger.js'; // Corrected path
import { RequestContext, requestContextService } from '../../../utils/requestContext.js'; // Corrected path
// Removed import of local McpToolResponse
import { CallToolResult } from '@modelcontextprotocol/sdk/types'; // Import SDK type

// --- Define Valid Models ---
const ValidPerplexityModels = z.enum([
  "sonar",
  "sonar-pro",
  "sonar-deep-research",
  "sonar-reasoning-pro",
  "sonar-reasoning"
]);

// --- Input Schema Definition ---

export const PerplexitySearchInputSchema = z.object({
  query: z.string().min(1).describe("The primary search query or question to be processed by Perplexity. This will be used for web search and LLM synthesis."),
  // model: ValidPerplexityModels.optional().describe(`Optional Perplexity model to use. Defaults to configured value: ${config.perplexityDefaultModel}.`), // Model is now determined solely by config
  return_related_questions: z.boolean().optional().default(false).describe("When true, instructs the Perplexity model to suggest related questions alongside the main answer, if available."),
  search_recency_filter: z.string().optional().describe("Optional filter to restrict the underlying web search to results published within a specific timeframe (e.g., 'day', 'week', 'month', 'year') before LLM processing."), // Consider enum if specific values are known and fixed
  search_domain_filter: z.array(z.string()).optional().describe("Optional list of specific domains (e.g., 'wikipedia.org') to limit the underlying web search to before LLM processing."),
  showThinking: z.boolean().optional().default(false).describe("When true, the tool's response will include the model's internal reasoning process (if provided by the model, typically in <think> tags) before the final answer. Defaults to false."),
  // We could add other parameters like temperature, max_tokens here if needed
});

export type PerplexitySearchInput = z.infer<typeof PerplexitySearchInputSchema>;

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
 * @param input - Validated input data.
 * @param parentContext - The context from the calling handler.
 * @returns A promise resolving to the SDK's CallToolResult structure.
 */
export async function executePerplexitySearch(
  input: PerplexitySearchInput,
  parentContext: RequestContext
): Promise<CallToolResult> { // Use SDK's CallToolResult type
  const operation = 'executePerplexitySearch';
  // Create a specific context for this operation, inheriting from the parent
  const context = requestContextService.createRequestContext({
    ...parentContext, // Inherit requestId and other parent context details
    operation: operation,
    toolName: 'perplexity_search',
    inputQuery: input.query, // Add specific details for this operation
  });

  logger.info(`[${operation}] Starting Perplexity search`, context);

  return await ErrorHandler.tryCatch(
    async () => {
      const modelToUse = config.perplexityDefaultModel; // Model is now fixed from config
      const searchContextSize = config.perplexityDefaultSearchContext;

      // Build the request payload, including the new optional parameters
      const requestPayload: PerplexityChatCompletionRequest = {
        model: modelToUse,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input.query },
        ],
        web_search_options: {
          search_context_size: searchContextSize,
        },
        stream: false, // Explicitly set stream to false as required by the type
        // Pass through optional parameters if provided in the input
        ...(input.return_related_questions !== undefined && { return_related_questions: input.return_related_questions }),
        ...(input.search_recency_filter && { search_recency_filter: input.search_recency_filter }),
        ...(input.search_domain_filter && input.search_domain_filter.length > 0 && { search_domain_filter: input.search_domain_filter }),
        // Add any other fixed parameters here if desired (e.g., temperature: 0.7)
      };

      logger.debug(`[${operation}] Calling Perplexity API`, { ...context, model: modelToUse, searchContext: searchContextSize, payload: requestPayload });

      const response = await perplexityApiService.chatCompletion(requestPayload, context);

      // Extract the raw response content
      const rawResultText = response.choices?.[0]?.message?.content;

      if (!rawResultText) {
        logger.warn(`[${operation}] Perplexity API returned empty content`, { ...context, responseId: response.id });
        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          'Perplexity API returned an empty response.',
          { ...context, responseId: response.id }
        );
      }

      // --- Parse <think> block ---
      const thinkRegex = /^\s*<think>(.*?)<\/think>\s*(.*)$/s;
      const match = rawResultText.match(thinkRegex);

      let thinkingContent: string | null = null;
      let mainContent: string;

      if (match) {
        thinkingContent = match[1].trim();
        mainContent = match[2].trim();
        logger.debug(`[${operation}] Parsed <think> block and main content`, { ...context, responseId: response.id });
      } else {
        mainContent = rawResultText.trim();
        logger.debug(`[${operation}] No <think> block found in response`, { ...context, responseId: response.id });
      }

      // --- Construct Final Response ---
      let finalResponseText: string;
      if (input.showThinking && thinkingContent) {
        finalResponseText = `--- Thinking ---\n${thinkingContent}\n\n--- Answer ---\n${mainContent}`;
      } else {
        finalResponseText = mainContent;
      }

      logger.info(`[${operation}] Perplexity search completed successfully`, { ...context, responseId: response.id, includedThinking: !!(input.showThinking && thinkingContent) });

      // Return the successful response
      return {
        content: [{ type: 'text', text: finalResponseText }],
      };
    },
    {
      operation: operation,
      context: context, // Pass the specific context for error logging
      input: input, // Log sanitized input on error
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code
      critical: false,
    }
  );
}
