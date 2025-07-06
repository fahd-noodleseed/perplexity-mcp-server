/**
 * @fileoverview Handles the registration of the `perplexity_deep_research` tool
 * with an MCP server instance.
 * @module src/mcp-server/tools/perplexityDeepResearch/registration
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
  PerplexityDeepResearchInput,
  PerplexityDeepResearchInputSchema,
  perplexityDeepResearchLogic,
} from "./logic.js";

/**
 * Registers the 'perplexity_deep_research' tool and its handler with the MCP server.
 *
 * @param server - The MCP server instance to register the tool with.
 * @returns A promise that resolves when tool registration is complete.
 */
export const registerPerplexityDeepResearchTool = async (
  server: McpServer,
): Promise<void> => {
  const toolName = "perplexity_deep_research";
  const toolDescription =
    "Performs an exhaustive, multi-source research query using the Perplexity Deep Research API. This tool is for complex topics requiring in-depth analysis and report generation, not for simple questions. Use the `reasoning_effort` parameter to control the depth. (Ex. 'Create a detailed document on utilizing '@modelcontextprotocol/sdk' v1.15.0')";

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
        PerplexityDeepResearchInputSchema.shape,
        async (
          params: PerplexityDeepResearchInput,
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
            const result = await perplexityDeepResearchLogic(params, handlerContext);
            return {
              content: [{ type: "text", text: result.rawResultText }],
              isError: false,
            };
          } catch (error) {
            const handledError = ErrorHandler.handleError(error, {
              operation: "perplexityDeepResearchToolHandler",
              context: handlerContext,
              input: params,
            });

            const mcpError =
              handledError instanceof McpError
                ? handledError
                : new McpError(
                    BaseErrorCode.INTERNAL_ERROR,
                    "An unexpected error occurred during perplexity deep research.",
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
