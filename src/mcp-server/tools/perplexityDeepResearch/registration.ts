/**
 * @fileoverview Handles registration and error handling for the `perplexity_deep_research` tool.
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
 * Registers the 'perplexity_deep_research' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexityDeepResearchTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_deep_research";
  const toolDescription =
    "Performs an exhaustive, multi-source research query using the Perplexity Deep Research API. This tool is for complex topics requiring in-depth analysis and report generation, not for simple questions. Use the `reasoning_effort` parameter to control the depth. (Ex. 'Create a detailed document on utilizing '@modelcontextprotocol/sdk' v1.15.0')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Deep Research",
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
        const thinkRegex = /^\s*<think>(.*?)<\/think>\s*(.*)$/s;
        const match = result.rawResultText.match(thinkRegex);

        let mainContent: string;

        if (match) {
          mainContent = match[2].trim();
        } else {
          mainContent = result.rawResultText.trim();
        }

        // --- Construct Final Response ---
        // For deep research, we always strip the thinking block and only show the final report.
        let responseText = mainContent;
        
        if (result.searchResults && result.searchResults.length > 0) {
            const citationText = result.searchResults.map((c, i) => `[${i+1}] ${c.title}: ${c.url}`).join('\n');
            responseText += `\n\nSources:\n${citationText}`;
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
