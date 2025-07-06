/**
 * @fileoverview Handles the registration of the `perplexity_search` tool
 * with an MCP server instance. This tool interfaces with the Perplexity API.
 * @module src/mcp-server/tools/perplexitySearch/registration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import {
  ErrorHandler,
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";
import {
  PerplexitySearchInput,
  PerplexitySearchInputSchema,
  perplexitySearchLogic,
} from "./logic.js";

/**
 * Registers the 'perplexity_search' tool and its handler with the MCP server.
 *
 * @param server - The MCP server instance to register the tool with.
 * @returns A promise that resolves when tool registration is complete.
 */
export const registerPerplexitySearchTool = async (
  server: McpServer,
): Promise<void> => {
  const toolName = "perplexity_search";
  const toolDescription =
    "Performs a search-augmented query using the Perplexity Search API. `perplexity_search` takes a natural language query, performs a web search, and uses an LLM to synthesize an answer. Use concise, specific queries for best results; include version information if applicable. Supports filtering by recency, date, domain, and search mode (web or academic). '(Ex. 'What are the latest advancements in quantum computing?')";

  const registrationContext: RequestContext =
    requestContextService.createRequestContext({
      operation: "RegisterTool",
      toolName: toolName,
    });

  logger.info(`Registering tool: '${toolName}'`, registrationContext);

  await ErrorHandler.tryCatch(
    async () => {
      server.tool(
        toolName,
        toolDescription,
        PerplexitySearchInputSchema.shape,
        async (
          params: PerplexitySearchInput,
          mcpContext: any,
        ): Promise<CallToolResult> => {
          const handlerContext: RequestContext =
            requestContextService.createRequestContext({
              parentRequestId: registrationContext.requestId,
              operation: "HandleToolRequest",
              toolName: toolName,
              mcpToolContext: mcpContext,
              input: params,
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
            let finalResponseText: string;
            if (params.showThinking && thinkingContent) {
              finalResponseText = `--- Thinking ---\n${thinkingContent}\n\n--- Answer ---\n${mainContent}`;
            } else {
              finalResponseText = mainContent;
            }

            return {
              content: [{ type: "text", text: finalResponseText }],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "perplexitySearchToolHandler",
              context: handlerContext,
              input: params,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred during perplexity search.",
                    { originalErrorName: handledError.name },
                  );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: {
                      code: mcpError.code,
                      message: mcpError.message,
                      details: mcpError.details,
                    },
                  }),
                },
              ],
              isError: true,
            };
          }
        },
      );

      logger.info(
        `Tool '${toolName}' registered successfully.`,
        registrationContext,
      );
    },
    {
      operation: `RegisteringTool_${toolName}`,
      context: registrationContext,
      errorCode: BaseErrorCode.INITIALIZATION_FAILED,
      critical: true,
    },
  );
};
