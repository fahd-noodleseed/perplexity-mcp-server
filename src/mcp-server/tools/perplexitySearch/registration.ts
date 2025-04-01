import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Corrected import path based on echoTool
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js'; // Added McpError
import { logger } from '../../../utils/logger.js';
import { PerplexitySearchInputSchema, executePerplexitySearch, PerplexitySearchInput } from './logic.js';
import { requestContextService } from '../../../utils/requestContext.js';
// Removed zod-to-json-schema import

/**
 * Registers the perplexity_search tool with the MCP server.
 * This tool utilizes the Perplexity API to perform a search-augmented query. It takes a natural language query, performs a web search using Perplexity's backend, and then uses an LLM (configured via environment variable) to synthesize an answer based on the search results. Optional parameters allow filtering the web search by recency or domain before the LLM processes the information.
 * @param server - The McpServer instance.
 */
export function registerPerplexitySearchTool(server: McpServer): void { // Changed to sync function based on echoTool
  const operation = 'registerPerplexitySearchTool';
  const toolName = 'perplexity_search';
  // Create a base context for registration logging
  const registrationContext = requestContextService.createRequestContext({ operation, toolName });

  ErrorHandler.tryCatch( // Use sync version for registration
    () => { // Registration logic is synchronous
      // Register the tool using server.tool()
      server.tool(
        toolName,
        // Pass the raw shape of the Zod schema, like echoTool
        PerplexitySearchInputSchema.shape,
        // --- Tool Handler ---
        // Params are automatically validated by the SDK against the shape
        async (params: PerplexitySearchInput) => { // Type params directly, no handlerContext needed here
          // Create context for this specific tool invocation
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext, // Link to registration context
            operation: 'HandlePerplexitySearchRequest',
            toolName: toolName,
            params: params // Log validated params
          });
          logger.debug("Handling perplexity search request", handlerContext);

          // Wrap the handler logic in tryCatch for robust error handling
          // No need for separate validation here, SDK handles it based on the shape
          return await ErrorHandler.tryCatch(
            async () => {
              // Delegate the core processing logic, passing the context
              const response = await executePerplexitySearch(params, handlerContext);
              logger.debug("Perplexity search tool processed successfully", handlerContext);
              // Return the response directly as it's already in McpToolResponse format
              return response;
            },
            {
              // Configuration for the error handler specific to this tool call
              operation: 'processing perplexity search handler',
              context: handlerContext, // Pass handler-specific context
              input: params, // Log input parameters on error
              // Provide a custom error mapping for more specific error reporting
              errorMapper: (error) => new McpError(
                error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
                `Error processing perplexity search tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { ...handlerContext } // Include context in the McpError
              )
            }
          );
        }
      ); // End of server.tool call

      logger.info(`Tool registered successfully: ${toolName}`, registrationContext);
    },
    {
      // Configuration for the error handler wrapping the entire registration
      operation: `registering tool ${toolName}`,
      context: registrationContext, // Context for registration-level errors
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code for registration failure
      // Custom error mapping for registration failures
      errorMapper: (error) => new McpError(
        error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
        `Failed to register tool '${toolName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ...registrationContext } // Include context in the McpError
      ),
      critical: true // Mark registration failure as critical
    }
  ); // End of ErrorHandler.tryCatch for registration
};
