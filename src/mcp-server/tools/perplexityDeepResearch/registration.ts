/**
 * @fileoverview Handles registration and error handling for the `perplexity_research` tool.
 * @module src/mcp-server/tools/perplexityDeepResearch/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import {
  PerplexityDeepResearchInput,
  PerplexityDeepResearchInputSchema,
  perplexityDeepResearchLogic,
  PerplexityDeepResearchResponseSchema,
} from "./logic.js";
import { McpError } from "../../../types-global/errors.js";

/**
 * Registers the 'perplexity_research' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexityDeepResearchTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_research";
  const toolDescription =
    "[HIGH-COST - REQUIRES EXPLICIT USER REQUEST] Exhaustive multi-source research producing 10,000+ word professional reports (cost: $0.40-$2+ per query, 10x more expensive than perplexity_ask). **DO NOT use automatically or infer need - ONLY when user EXPLICITLY says 'deep research', 'comprehensive research report', 'exhaustive investigation', or specifically requests this tool.** For regular research questions, use perplexity_ask. For code generation, use perplexity_reason. (Ex. User explicitly says: 'I need a deep research report on the quantum computing industry' or 'Do exhaustive research on...')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Research",
      description: toolDescription,
      inputSchema: PerplexityDeepResearchInputSchema.shape,
      outputSchema: PerplexityDeepResearchResponseSchema.shape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async (params: PerplexityDeepResearchInput) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName,
      });

      try {
        const result = await perplexityDeepResearchLogic(params, handlerContext);

        // --- Parse <think> block ---
        // Deep research responses typically include extensive <think> blocks
        const thinkRegex = /^\s*<think>(.*?)<\/think>\s*(.*)$/s;
        const match = result.rawResultText.match(thinkRegex);

        let thinkingContent: string | null = null;
        let mainContent: string;

        if (match) {
          thinkingContent = match[1].trim();
          mainContent = match[2].trim();
        } else {
          mainContent = result.rawResultText.trim();
        }

        // --- Construct Final Response ---
        // Include thinking blocks to show research strategy and reasoning
        let responseText = '';

        if (thinkingContent) {
          responseText += `## Research Strategy & Reasoning\n\n<think>\n${thinkingContent}\n</think>\n\n---\n\n`;
        }

        responseText += mainContent;

        // Add sources/citations section
        if (result.citations && result.citations.length > 0) {
          responseText += `\n\n## Citations\n\n`;
          result.citations.forEach((url, i) => {
            responseText += `[${i+1}] ${url}\n`;
          });
        }

        // Add search results with snippets if available
        if (result.searchResults && result.searchResults.length > 0) {
          responseText += `\n\n## Search Results Used (${result.searchResults.length} sources)\n\n`;
          result.searchResults.slice(0, 10).forEach((sr, i) => {
            responseText += `[${i+1}] **${sr.title}**\n`;
            responseText += `    URL: ${sr.url}\n`;
            if (sr.snippet) {
              responseText += `    Snippet: ${sr.snippet.substring(0, 200)}${sr.snippet.length > 200 ? '...' : ''}\n`;
            }
            if (sr.date) {
              responseText += `    Date: ${sr.date}\n`;
            }
            responseText += `\n`;
          });
          if (result.searchResults.length > 10) {
            responseText += `... and ${result.searchResults.length - 10} more sources\n`;
          }
        }

        // Add cost breakdown if available
        if (result.costBreakdown) {
          responseText += `\n\n## Cost Breakdown\n\n`;
          responseText += `- Input tokens: $${result.costBreakdown.input_tokens_cost.toFixed(3)}\n`;
          responseText += `- Output tokens: $${result.costBreakdown.output_tokens_cost.toFixed(3)}\n`;
          responseText += `- Citation tokens: $${result.costBreakdown.citation_tokens_cost.toFixed(3)}\n`;
          responseText += `- Reasoning tokens: $${result.costBreakdown.reasoning_tokens_cost.toFixed(3)}\n`;
          responseText += `- Search queries: $${result.costBreakdown.search_queries_cost.toFixed(3)}\n`;
          responseText += `- **Total: $${result.costBreakdown.total_cost.toFixed(3)}**\n`;
        }

        // Add usage stats
        if (result.usage) {
          responseText += `\n\n## Usage Statistics\n\n`;
          responseText += `- Reasoning tokens: ${result.usage.reasoning_tokens?.toLocaleString() || 'N/A'}\n`;
          responseText += `- Search queries performed: ${result.usage.num_search_queries || 'N/A'}\n`;
          responseText += `- Total tokens: ${result.usage.total_tokens.toLocaleString()}\n`;
        }

        return {
          structuredContent: result,
          content: [{ type: "text", text: responseText }],
        };
      } catch (error) {
        const mcpError = ErrorHandler.handleError(error, {
          operation: toolName,
          context: handlerContext,
          input: params,
        }) as McpError;

        return {
          isError: true,
          content: [{ type: "text", text: mcpError.message }],
          structuredContent: {
            code: mcpError.code,
            message: mcpError.message,
            details: mcpError.details,
          },
        };
      }
    }
  );
  logger.info(`Tool '${toolName}' registered successfully.`);
};
