/**
 * @fileoverview Handles registration and error handling for the `perplexity_think_and_analyze` tool.
 * @module src/mcp-server/tools/perplexityThinkAndAnalyze/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorHandler, logger, requestContextService } from "../../../utils/index.js";
import {
  PerplexityThinkAndAnalyzeInput,
  PerplexityThinkAndAnalyzeInputSchema,
  perplexityThinkAndAnalyzeLogic,
  PerplexityThinkAndAnalyzeResponseSchema,
} from "./logic.js";
import { McpError } from "../../../types-global/errors.js";

/**
 * Registers the 'perplexity_think_and_analyze' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexityThinkAndAnalyzeTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_think_and_analyze";
  const toolDescription =
    "Perform logical reasoning, analysis, and step-by-step thinking using Perplexity's sonar-reasoning-pro model. Best for complex problem-solving, mathematical calculations, code analysis, logical puzzles, and questions requiring structured thinking. Provides detailed reasoning processes and methodical analysis. (Ex. 'Analyze the algorithmic complexity of this sorting algorithm and suggest optimizations')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Think and Analyze",
      description: toolDescription,
      inputSchema: PerplexityThinkAndAnalyzeInputSchema.shape,
      outputSchema: PerplexityThinkAndAnalyzeResponseSchema.shape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async (params: PerplexityThinkAndAnalyzeInput) => {
      const handlerContext = requestContextService.createRequestContext({
        toolName,
      });

      try {
        const result = await perplexityThinkAndAnalyzeLogic(params, handlerContext);
        
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
          responseText = `--- Thinking Process ---\n${thinkingContent}\n\n--- Analysis ---\n${mainContent}`;
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