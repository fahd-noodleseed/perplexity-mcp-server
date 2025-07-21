/**
 * @fileoverview Handles registration and error handling for the `perplexity_search` tool.
 * @module src/mcp-server/tools/perplexitySearch/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import {
  PerplexitySearchInput,
  PerplexitySearchInputSchema,
  perplexitySearchLogic,
  PerplexitySearchResponseSchema,
} from "./logic.js";
import { McpError } from "../../../types-global/errors.js";

/**
 * Registers the 'perplexity_search' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexitySearchTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_search";
  const toolDescription =
    "Performs a search-augmented query using the Perplexity Search API. `perplexity_search` takes a natural language query, performs a web search, and uses an LLM to synthesize an answer. Use concise, specific queries for best results; include version information if applicable. Supports filtering by recency, date, domain, and search mode (web or academic). '(Ex. 'What are the latest advancements in quantum computing?')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Search",
      description: toolDescription,
      inputSchema: PerplexitySearchInputSchema.shape,
      outputSchema: PerplexitySearchResponseSchema.shape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async (params: PerplexitySearchInput) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName,
      });

      try {
        const result = await perplexitySearchLogic(params, handlerContext);
        
        // --- Parse <think> block ---
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
        let responseText = mainContent;
        if (params.showThinking && thinkingContent) {
          responseText = `--- Thinking ---\n${thinkingContent}\n\n--- Answer ---\n${mainContent}`;
        }
        
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
