/**
 * @fileoverview Defines the core logic, schemas, and types for the `perplexity_ask` tool.
 * This tool interfaces with the Perplexity API to provide comprehensive, multi-source answers using the sonar-pro model.
 * @module src/mcp-server/tools/perplexityAsk/logic
 */

import { z } from 'zod';
import { config } from '../../../config/index.js';
import { perplexityApiService, PerplexityChatCompletionRequest, PerplexityChatCompletionRequestSchema } from '../../../services/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger, RequestContext } from '../../../utils/index.js';


// 1. DEFINE Zod input and output schemas.

// File attachment schema for multimodal support
const FileInputSchema = z.object({
  url: z.string().url().optional().describe("Public URL to the file (documents: PDF, DOC, DOCX, TXT, RTF; images: PNG, JPEG, WEBP, GIF)."),
  base64: z.string().optional().describe("Base64 encoded file content (without data: prefix). Alternative to URL."),
  file_name: z.string().optional().describe("Optional file name for better context."),
}).refine(
  (data) => data.url || data.base64,
  { message: "Either 'url' or 'base64' must be provided for each file." }
).describe("File attachment object. Provide either a public URL or base64 encoded content. Supported formats: PDF, DOC, DOCX, TXT, RTF (documents); PNG, JPEG, WEBP, GIF (images). Max 50MB per file.");

export const PerplexityAskInputSchema = z.object({
  query: z.string().min(1).describe("The natural language query for comprehensive research and analysis."),
  files: z.array(FileInputSchema).optional().describe("Optional array of file attachments to analyze alongside the query. Combine document/image analysis with web research. Each file needs either 'url' or 'base64'. Supported: PDF, DOC, DOCX, TXT, RTF, PNG, JPEG, WEBP, GIF (max 50MB per file)."),
  return_related_questions: z.boolean().optional().default(false).describe("If true, the model will suggest related questions in its response. Defaults to false."),
  search_recency_filter: z.string().optional().describe("Restricts the web search to a specific timeframe. Accepts 'day', 'week', 'month', 'year'."),
  search_domain_filter: z.array(z.string()).max(20).optional().describe(
    "Filter search results by domain (max 20). " +
    "ALLOWLIST (include only): ['nasa.gov', 'wikipedia.org'] - use simple domain names without https:// or www. " +
    "DENYLIST (exclude): ['-pinterest.com', '-reddit.com'] - prefix with '-' to exclude. " +
    "URL-LEVEL: ['https://example.com/specific-page'] - complete URLs to target specific pages. " +
    "SPECIAL: ['sec'] - search SEC filings (10-K, 10-Q, 8-K). " +
    "Cannot mix allowlist and denylist modes. Main domains filter all subdomains automatically."
  ),
  search_after_date_filter: z.string().optional().describe("Filters search results to content published after a specific date (MM/DD/YYYY)."),
  search_before_date_filter: z.string().optional().describe("Filters search results to content published before a specific date (MM/DD/YYYY)."),
  search_mode: z.enum(['web', 'academic']).optional().describe("Set to 'academic' to prioritize scholarly sources."),
}).describe("Get comprehensive, well-researched answers from multiple sources using Perplexity's sonar-pro model. Supports file attachments (PDFs, documents, images) for multimodal analysis. Best for complex questions requiring detailed analysis, document review, or combining local files with web research. (Ex. 'Analyze this API specification PDF and compare with current best practices', 'What are the latest advancements in quantum computing?')");

const SearchResultSchema = z.object({
    title: z.string().describe("The title of the search result."),
    url: z.string().url().describe("The URL of the search result."),
    date: z.string().nullable().optional().describe("The publication date of the search result. Can be null."),
});

export const PerplexityAskResponseSchema = z.object({
    rawResultText: z.string().describe("The synthesized answer from the Perplexity model."),
    responseId: z.string().describe("The unique identifier for the Perplexity API response."),
    modelUsed: z.string().describe("The model that was used to generate the response."),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
    }).describe("Token usage details for the API call."),
    searchResults: z.array(SearchResultSchema).optional().describe("An array of web search results used to generate the response."),
});


// 2. INFER and export TypeScript types.
export type PerplexityAskInput = z.infer<typeof PerplexityAskInputSchema>;
export type PerplexityAskResponse = z.infer<typeof PerplexityAskResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;


// --- System Prompt ---
const SYSTEM_PROMPT = `You are an expert research assistant using Perplexity's comprehensive search capabilities. Your mission is to provide thorough, well-researched answers by synthesizing information from multiple authoritative sources.

**Core Directives:**

1.  **Comprehensive Coverage:** Search extensively across multiple high-quality sources to provide complete, nuanced answers. Prioritize depth and breadth of coverage.
2.  **Authority & Reliability:** Focus on authoritative sources - academic papers, established publications, official documentation, and expert analyses. Critically evaluate source credibility.
3.  **Precise Citations:** Every claim must be supported with accurate inline citations. Include complete citation metadata (URL, title, publication).
4.  **Multi-Perspective Analysis:** When appropriate, present different viewpoints and synthesize conflicting information to provide balanced coverage.

**Response Format:**

1.  **Comprehensive Synthesis:** Provide detailed, well-structured answers that thoroughly address the query from multiple angles.
2.  **Clear Organization:** Use logical structure with clear sections, bullet points, or numbered lists when helpful for readability.
3.  **Expert-Level Detail:** Include relevant technical details, context, and implications that provide genuine insight.
4.  **Professional Tone:** Write as an expert addressing other experts - authoritative but accessible.`;

/**
 * 3. IMPLEMENT and export the core logic function.
 * It must remain pure: its only concerns are its inputs and its return value or thrown error.
 * @throws {McpError} If the logic encounters an unrecoverable issue.
 */
export async function perplexityAskLogic(
  params: PerplexityAskInput,
  context: RequestContext
): Promise<PerplexityAskResponse> {
  logger.debug("Executing perplexityAskLogic...", { ...context, toolInput: params });

  // Always use sonar-pro for comprehensive research
  const model = 'sonar-pro';

  // Construct user message - multimodal if files present, simple string otherwise
  let userMessage: any;

  if (params.files && params.files.length > 0) {
    // Multimodal message with files
    const contentArray: any[] = [
      { type: 'text', text: params.query }
    ];

    // Add each file to the content array
    for (const file of params.files) {
      let fileUrl: string;

      if (file.url) {
        // Use provided URL directly
        fileUrl = file.url;
      } else if (file.base64) {
        // For base64: Determine if image or document based on file_name
        const fileName = file.file_name?.toLowerCase() || '';
        const isImage = fileName.endsWith('.png') || fileName.endsWith('.jpg') ||
                       fileName.endsWith('.jpeg') || fileName.endsWith('.webp') ||
                       fileName.endsWith('.gif');

        if (isImage) {
          // Images need data URI format with MIME type
          let mimeType = 'image/png'; // default
          if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
          else if (fileName.endsWith('.webp')) mimeType = 'image/webp';
          else if (fileName.endsWith('.gif')) mimeType = 'image/gif';

          fileUrl = `data:${mimeType};base64,${file.base64}`;
        } else {
          // Documents need raw base64 (no prefix)
          fileUrl = file.base64;
        }
      } else {
        // Shouldn't happen due to Zod validation, but handle gracefully
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          'File must have either url or base64',
          { ...context }
        );
      }

      const fileContent: any = {
        type: 'file_url',
        file_url: { url: fileUrl }
      };

      if (file.file_name) {
        fileContent.file_name = file.file_name;
      }

      contentArray.push(fileContent);
    }

    userMessage = { role: 'user', content: contentArray };

    logger.info("Multimodal request with file attachments", {
      ...context,
      fileCount: params.files.length,
      hasBase64: params.files.some(f => f.base64),
      hasUrls: params.files.some(f => f.url)
    });
  } else {
    // Simple text message (backward compatibility)
    userMessage = { role: 'user', content: params.query };
  }

  const requestPayload: PerplexityChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      userMessage,
    ],
    stream: false,
    ...(params.return_related_questions && { return_related_questions: params.return_related_questions }),
    ...(params.search_recency_filter && { search_recency_filter: params.search_recency_filter }),
    ...(params.search_domain_filter && { search_domain_filter: params.search_domain_filter }),
    ...(params.search_after_date_filter && { search_after_date_filter: params.search_after_date_filter }),
    ...(params.search_before_date_filter && { search_before_date_filter: params.search_before_date_filter }),
    ...(params.search_mode && { search_mode: params.search_mode }),
  };

  logger.info("Calling Perplexity API with sonar-pro model", { ...context, model });
  logger.debug("API Payload", { ...context, payload: requestPayload });

  const response = await perplexityApiService.chatCompletion(requestPayload, context);

  const rawResultText = response.choices?.[0]?.message?.content;

  if (!rawResultText) {
    logger.warning("Perplexity API returned empty content", { ...context, responseId: response.id });
    throw new McpError(
      BaseErrorCode.SERVICE_UNAVAILABLE,
      'Perplexity API returned an empty response.',
      { ...context, responseId: response.id }
    );
  }

  const toolResponse: PerplexityAskResponse = {
    rawResultText,
    responseId: response.id,
    modelUsed: response.model,
    usage: response.usage,
    searchResults: response.search_results,
  };

  logger.info("Perplexity ask logic completed successfully.", {
    ...context,
    responseId: toolResponse.responseId,
    model: toolResponse.modelUsed,
    usage: toolResponse.usage,
    searchResultCount: toolResponse.searchResults?.length ?? 0,
  });

  return toolResponse;
}
