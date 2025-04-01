import { z } from 'zod';
import { McpToolResponse } from './mcp.js'; // Import McpToolResponse
import { OperationContext } from "../utils/requestContext.js"; // Updated import

/**
 * Base interface for tool input parameters
 */
export interface BaseToolInput {
  [key: string]: unknown;
}

/**
 * Base interface for tool response content
 */
export interface BaseToolResponse {
  [key: string]: unknown;
}

/**
 * Interface for tool registration options
 */
export interface ToolRegistrationOptions<TInput extends BaseToolInput> {
  /** Zod schema for input validation */
  inputSchema: z.ZodType<TInput>;
  /** Description of the tool */
  description: string;
  /** Example usage scenarios */
  examples?: { name: string; input: TInput; description?: string }[];
}

/**
 * Interface for a tool handler function
 */
export type ToolHandler<TInput extends BaseToolInput, TResponse extends McpToolResponse> = (
  input: TInput,
  context: OperationContext
) => Promise<TResponse>;
