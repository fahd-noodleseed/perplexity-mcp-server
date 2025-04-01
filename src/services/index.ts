/**
 * Barrel file for exporting services.
 * This makes it easier to import services from other parts of the application.
 *
 * Example Usage:
 * import { perplexityApiService, PerplexityChatCompletionRequest } from './services';
 */

export {
  perplexityApiService,
  PerplexityChatCompletionRequestSchema,
  type PerplexityChatCompletionRequest,
  type PerplexityChatCompletionResponse,
} from './perplexityApi.js'; // Ensure .js extension for ES module compatibility
