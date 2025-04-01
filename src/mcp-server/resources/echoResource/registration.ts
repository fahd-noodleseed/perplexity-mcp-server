import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListResourcesResult } from "@modelcontextprotocol/sdk/types.js"; // Import specific type
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { requestContextService } from '../../../utils/requestContext.js'; // Import the service
// Import logic, schema, and type from the dedicated logic file
import { processEchoResource, querySchema, EchoParams } from './echoResourceLogic.js';

/**
 * Registers the 'echo' resource and its handlers with the provided MCP server instance.
 * This includes defining the resource template, metadata, query schema, examples,
 * and the core request handling logic. Error handling is integrated using ErrorHandler.
 *
 * @async
 * @function registerEchoResource
 * @param {McpServer} server - The MCP server instance to register the resource with.
 * @returns {Promise<void>} A promise that resolves when the resource registration is complete.
 * @throws {McpError} Throws an McpError if the registration process fails critically.
 */
export const registerEchoResource = async (server: McpServer): Promise<void> => {
  const resourceName = "echo-resource"; // Internal identifier for the resource

  // Create registration context using the service
  const registrationContext = requestContextService.createRequestContext({
    operation: 'RegisterEchoResource',
    resourceName: resourceName,
    module: 'EchoResourceRegistration'
  });

  logger.info(`Registering resource: ${resourceName}`, registrationContext);

  // Use ErrorHandler to wrap the entire registration process for robustness
  await ErrorHandler.tryCatch(
    async () => {
      // Define the resource template structure (URI pattern and basic operations)
      const template = new ResourceTemplate(
        "echo://{message}", // URI template using RFC 6570 syntax
        {
          // --- List Operation ---
          // Provides a list of example or discoverable resource URIs.
          list: async (): Promise<ListResourcesResult> => ({ // Return a simple list of example URIs
            resources: [{
              uri: "echo://hello", // Example static URI
              name: "Default Echo Message",
              description: "A simple echo resource example using a default message."
            }]
          }),
          // --- Complete Operation ---
          // (Optional) Provides suggestions or completions based on partial input.
          // Not implemented for this simple resource.
          complete: {}
        }
      );
      logger.debug(`Resource template created for ${resourceName}`, registrationContext);

      // Register the resource, its template, metadata, and handler with the server
      server.resource(
        resourceName, // The unique name for this resource registration
        template,     // The ResourceTemplate defined above
        // --- Resource Metadata ---
        {
          name: "Echo Message", // User-friendly name
          description: "A simple echo resource that returns a message, optionally specified in the URI.",
          mimeType: "application/json", // Default MIME type for responses

          // --- Query Schema ---
          // Defines expected query parameters (though this example uses path params via template)
          querySchema: querySchema, // Use the Zod schema defined earlier

          // --- Examples ---
          // Provides illustrative examples for clients
          examples: [
            {
              name: "Basic echo",
              uri: "echo://hello",
              description: "Get a default welcome message."
            },
            {
              name: "Custom echo",
              uri: "echo://custom-message-here",
              description: "Get a response echoing 'custom-message-here'."
            }
          ],
        },

        // --- Resource Handler ---
        // The core logic executed when a request matches the resource template.
        async (uri: URL, params: EchoParams) => {
          // Create handler context using the service
          const handlerContext = requestContextService.createRequestContext({
            parentContext: registrationContext, // Link to the registration context if needed
            operation: 'HandleEchoResourceRequest',
            resourceName: resourceName,
            uri: uri.href,
            params: params // Include relevant request details
          });
          logger.debug("Handling echo resource request", handlerContext);

          // Wrap the handler logic in tryCatch for robust error handling
          return await ErrorHandler.tryCatch(
            async () => {
              // Delegate the core processing logic, passing the context
              const responseData = processEchoResource(uri, params, handlerContext);
              logger.debug("Echo resource processed successfully", handlerContext);

              // Return the response in the standardized format expected by the MCP SDK
              return {
                contents: [{
                  uri: uri.href, // Echo back the requested URI
                  text: JSON.stringify(responseData, null, 2), // Stringify the JSON payload
                  mimeType: "application/json" // Specify the content type
                }]
              };
            },
            {
              // Configuration for the error handler specific to this request
              operation: 'processing echo resource handler',
              context: handlerContext, // Pass handler-specific context
              input: { uri: uri.href, params }, // Log input on error
              // Provide a custom error mapping for more specific error reporting
              errorMapper: (error) => new McpError(
                BaseErrorCode.INTERNAL_ERROR, // Map internal errors
                `Error processing echo resource request for URI '${uri.href}': ${error instanceof Error ? error.message : 'Unknown error'}`,
                { ...handlerContext } // Include context in the McpError
              )
            }
          );
        }
      ); // End of server.resource call

      logger.info(`Resource registered successfully: ${resourceName}`, registrationContext);
    },
    {
      // Configuration for the error handler wrapping the entire registration
      operation: `registering resource ${resourceName}`,
      context: registrationContext, // Context for registration-level errors
      errorCode: BaseErrorCode.INTERNAL_ERROR, // Default error code for registration failure
      // Custom error mapping for registration failures
      errorMapper: (error) => new McpError(
        error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
        `Failed to register resource '${resourceName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { ...registrationContext } // Include context in the McpError
      ),
      critical: true // Mark registration failure as critical to halt startup
    }
  ); // End of ErrorHandler.tryCatch for registration
};
