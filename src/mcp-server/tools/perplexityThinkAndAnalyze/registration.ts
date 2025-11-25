/**
 * @fileoverview Handles registration and error handling for the `perplexity_reason` tool.
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
 * Registers the 'perplexity_reason' tool with the MCP server instance.
 * @param server - The MCP server instance.
 */
export const registerPerplexityThinkAndAnalyzeTool = async (server: McpServer): Promise<void> => {
  const toolName = "perplexity_reason";
  const toolDescription =
    "[CODE GENERATION & REASONING] Generate code, combine concepts, and perform step-by-step analysis using Perplexity's sonar-reasoning-pro model. Use this tool whenever you need to: generate code samples, combine multiple libraries/concepts into working code, debug code, analyze algorithms, solve programming problems, or create implementation examples. This is the PRIMARY tool for any task requiring code output or technical reasoning. Do NOT use perplexity_ask for code generation. (Ex. 'Write a React component that fetches data and handles loading states', 'How do I combine Redux with React Query?', 'Debug this async/await code', 'Implement a binary search algorithm')";

  server.registerTool(
    toolName,
    {
      title: "Perplexity Reason",
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