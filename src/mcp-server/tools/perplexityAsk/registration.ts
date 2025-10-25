/**
 * @fileoverview Handles registration and error handling for the `perplexity_ask` tool.
 * @module src/mcp-server/tools/perplexityAsk/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import {
  PerplexityAskInput,
  PerplexityAskInputSchema,
  perplexityAskLogic,
  PerplexityAskResponseSchema,
} from "./logic.js";
import { McpError } from "../../../types-global/errors.js";

/**
 * Registers the 'perplexity_search' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexityAskTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_ask";
  const toolDescription =
    "[DEFAULT RESEARCH TOOL] Get comprehensive, well-researched answers from multiple sources using Perplexity's sonar-pro model. Use this tool for most research queries, questions requiring current information, fact-finding, explanations, and topics needing authoritative multi-source answers. Cost-effective and suitable for 99% of research needs. (Ex. 'What are the latest advancements in quantum computing?', 'Explain blockchain technology', 'Compare cloud providers')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Ask",
      description: toolDescription,
      inputSchema: PerplexityAskInputSchema.shape,
      outputSchema: PerplexityAskResponseSchema.shape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async (params: PerplexityAskInput) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName,
      });

      try {
        const result = await perplexityAskLogic(params, handlerContext);
        
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
        // Note: perplexity_ask doesn't support showThinking parameter
        
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
