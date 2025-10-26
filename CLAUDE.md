# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run rebuild` - Clean and rebuild the project (removes dist/ and logs/, then rebuilds)
- `npm run clean` - Remove dist/ and logs/ directories
- `npm start` - Start the server using stdio transport (default)
- `npm test` - Run tests (placeholder - tests not yet implemented)
- `npm run tree` - Generate file tree documentation

### Running via npx
- `npx noodle-perplexity-mcp` - Run server directly without installation
- `npm install -g noodle-perplexity-mcp && noodle-perplexity-mcp` - Install globally and run

### Publishing
- `npm run prepublishOnly` - Automatically runs rebuild before publishing

## Core Architecture

This is a **Perplexity MCP Server** that provides AI agents access to Perplexity's search-augmented generation capabilities through the Model Context Protocol (MCP). The server enables LLMs to perform fast, search-augmented queries and conduct exhaustive, multi-source deep research.

### Transport Layer
The server supports two transport mechanisms configured via `MCP_TRANSPORT_TYPE`:
- **stdio** (default): Direct process communication for Claude Desktop and similar clients
- **http**: HTTP server with authentication (JWT/OAuth 2.1) for web-based integrations

### Tool Development Architecture

**CRITICAL**: The codebase follows "The Logic Throws, The Handler Catches" principle:

#### File Structure Pattern (src/mcp-server/tools/toolName/):
- `index.ts` - Barrel file exporting registration function
- `logic.ts` - Pure business logic with Zod schemas; MUST throw McpError on failure
- `registration.ts` - MCP server registration; MUST wrap logic calls in try/catch

#### Error Handling Flow:
1. **Logic Layer** (`logic.ts`): Contains pure business logic, throws structured `McpError` on failure
2. **Handler Layer** (`registration.ts`): Catches errors, processes with `ErrorHandler`, returns formatted `CallToolResult`

#### Request Context Pattern:
Every operation must create a `RequestContext` via `requestContextService.createRequestContext()` and pass it through the entire call stack for traceability.

## Available Tools

### `perplexity_ask` (sonar-pro model)
- **Purpose**: Comprehensive research and detailed answers from multiple sources
- **Best for**: Complex questions requiring thorough analysis, detailed explanations, multi-perspective coverage
- **Key Parameters**:
  - `query`: The research question
  - `files`: **NEW** - Optional array of file attachments (PDFs, documents, images) for multimodal analysis
  - `search_recency_filter`: Filter by time ('day', 'week', 'month', 'year')
  - `search_domain_filter`: Array of domains to restrict or exclude (e.g., ['wikipedia.org', 'arxiv.org'])
  - `search_after_date_filter`: Content published after date (MM/DD/YYYY)
  - `search_before_date_filter`: Content published before date (MM/DD/YYYY)
  - `search_mode`: 'web' or 'academic' (prioritize scholarly sources)
  - `return_related_questions`: Boolean to suggest related questions (default: false)

### `perplexity_think_and_analyze` (sonar-reasoning-pro model)
- **Purpose**: Logical reasoning, step-by-step analysis, and structured problem-solving
- **Best for**: Mathematical problems, code analysis, logical puzzles, systematic thinking
- **Key Parameters**:
  - `query`: The problem to analyze
  - `files`: **NEW** - Optional array of file attachments for code analysis, debugging, document review
  - `showThinking`: Boolean to expose internal reasoning process (default: false)
  - `search_recency_filter`: Filter by time ('day', 'week', 'month', 'year')
  - `search_domain_filter`: Array of domains to restrict or exclude
  - `search_after_date_filter`: Content published after date (MM/DD/YYYY)
  - `search_before_date_filter`: Content published before date (MM/DD/YYYY)
  - `search_mode`: 'web' or 'academic'

### `perplexity_deep_research` (sonar-deep-research model)
- **Purpose**: Exhaustive, multi-source deep research with expert-level insights and transparent reasoning
- **Best for**: Academic research, market analysis, competitive intelligence, due diligence, complex questions requiring comprehensive investigation across hundreds of sources
- **Key Features**:
  - Conducts 10-20+ searches and synthesizes findings into comprehensive research reports (typically 10,000+ words)
  - Exposes reasoning process via `<think>` blocks showing research strategy
  - Returns detailed cost breakdown (input/output/citation/reasoning tokens, search queries)
  - Provides enhanced search results with snippets and metadata
  - Supports reasoning_effort parameter to control depth: 'low' (faster/cheaper), 'medium' (balanced), 'high' (most comprehensive)
- **Key Parameters**:
  - `query`: The research question or topic for exhaustive multi-source analysis
  - `reasoning_effort`: 'low', 'medium', or 'high' (default: 'medium') - controls computational depth and thoroughness
  - `return_related_questions`: Boolean to suggest related questions for further research (default: false)
  - `search_recency_filter`: Filter by time ('day', 'week', 'month', 'year')
  - `search_domain_filter`: Array of domains to restrict or exclude (e.g., ['wikipedia.org', 'arxiv.org'])
  - `search_after_date_filter`: Content published after date (MM/DD/YYYY)
  - `search_before_date_filter`: Content published before date (MM/DD/YYYY)
  - `search_mode`: 'web' or 'academic' (prioritize scholarly sources)
- **Response Includes**:
  - Comprehensive research report with executive summary and detailed analysis
  - Research strategy & reasoning (`<think>` blocks)
  - Citations (array of URLs referenced in the report)
  - Search results with snippets (up to first 10 displayed)
  - Cost breakdown (itemized: input/output/citation/reasoning tokens, search queries)
  - Usage statistics (reasoning tokens, search queries performed, total tokens)

## File Attachments (Multimodal Support)

The `perplexity_ask` and `perplexity_think_and_analyze` tools support file attachments, enabling multimodal analysis that combines document/image analysis with web research.

### Supported File Formats

**Documents** (max 50MB per file):
- PDF (.pdf)
- Word Documents (.doc, .docx)
- Text Files (.txt)
- Rich Text Format (.rtf)

**Images**:
- PNG (.png)
- JPEG (.jpg, .jpeg)
- WebP (.webp)
- GIF (.gif)

### File Input Methods

**1. Public URL**
```json
{
  "query": "Analyze this API specification and compare with current best practices",
  "files": [
    {
      "url": "https://example.com/api-spec.pdf",
      "file_name": "api-specification.pdf"
    }
  ]
}
```

**2. Base64 Encoding**
```json
{
  "query": "Review this error screenshot and suggest solutions",
  "files": [
    {
      "base64": "iVBORw0KGgoAAAANSUhEUgA...",
      "file_name": "error-screenshot.png"
    }
  ]
}
```

**Note**: For base64 encoding, do NOT include the `data:` prefix - provide only the raw base64 string.

### Common Use Cases

**1. API Documentation Analysis**
Combine API specifications with web research for implementation guidance:
```json
{
  "query": "Analyze this OpenAPI specification and find best practices for implementing authentication",
  "files": [{"url": "https://example.com/openapi.json", "file_name": "api-spec.json"}],
  "search_domain_filter": ["stackoverflow.com", "github.com", "auth0.com"]
}
```

**2. Error Debugging**
Analyze error logs/screenshots alongside web search for solutions:
```json
{
  "query": "Identify the root cause of this error and search for solutions",
  "files": [{"url": "https://example.com/error-log.txt", "file_name": "application.log"}],
  "search_recency_filter": "month"
}
```

**3. Code Review with Research**
Review code files and compare with current best practices:
```json
{
  "query": "Review this implementation and compare with modern React patterns",
  "files": [{"url": "https://example.com/component.tsx", "file_name": "UserDashboard.tsx"}],
  "search_mode": "academic"
}
```

**4. Architecture Diagram Analysis**
Analyze architecture diagrams alongside pattern research:
```json
{
  "query": "Evaluate this system architecture and suggest improvements based on microservices best practices",
  "files": [{"url": "https://example.com/architecture.png", "file_name": "current-architecture.png"}],
  "search_domain_filter": ["martinfowler.com", "aws.amazon.com", "microsoft.com"]
}
```

**5. Multiple File Analysis**
Analyze multiple related files together:
```json
{
  "query": "Compare these API specifications and identify compatibility issues",
  "files": [
    {"url": "https://example.com/api-v1.pdf", "file_name": "api-v1.pdf"},
    {"url": "https://example.com/api-v2.pdf", "file_name": "api-v2.pdf"}
  ]
}
```

### Best Practices

**File Size**:
- Maximum 50MB per file (API enforced)
- Larger files may increase processing time
- For large documents, consider extracting relevant sections

**File Accessibility**:
- URL files must be publicly accessible (no authentication)
- Test URLs before using them in requests
- Use base64 for private/local files

**Combining with Search**:
- Use file attachments + web research for comprehensive analysis
- Apply search filters to focus on relevant sources
- Use `search_mode: 'academic'` for technical documentation analysis

**Error Handling**:
- Unsupported file formats will return validation errors
- Inaccessible URLs will fail with clear error messages
- Invalid base64 will be rejected during validation

### Limitations

- Text-based documents work best; scanned images not supported for text extraction
- Password-protected files not supported
- Processing timeout: 60 seconds
- File attachments not supported for `perplexity_deep_research` (may be added in future)

## Advanced Domain Filtering

All three Perplexity tools (`perplexity_ask`, `perplexity_think_and_analyze`, `perplexity_deep_research`) support advanced domain filtering via the `search_domain_filter` parameter. This powerful feature enables you to control exactly which sources are used for search results.

### Filtering Modes

**1. Allowlist Mode** (Include Only Specific Domains)
```json
{
  "search_domain_filter": ["nasa.gov", "wikipedia.org", "space.com"]
}
```
- Only searches the specified domains
- Use simple domain names without `https://` or `www.`
- Main domain includes all subdomains automatically (e.g., `nytimes.com` includes `cooking.nytimes.com`)

**2. Denylist Mode** (Exclude Specific Domains)
```json
{
  "search_domain_filter": ["-pinterest.com", "-reddit.com", "-quora.com"]
}
```
- Excludes specified domains from search results
- Prefix domain with `-` to exclude
- Useful for filtering out noise and low-quality sources

**3. URL-Level Filtering** (Target or Exclude Specific Pages)
```json
{
  "search_domain_filter": [
    "https://en.wikipedia.org/wiki/Chess",
    "https://en.wikipedia.org/wiki/World_Chess_Championship",
    "https://chess.com"
  ]
}
```
- Use complete URLs with protocol for page-level control
- Can target specific articles or pages
- Can also exclude specific pages: `["-https://example.com/exclude-this-page"]`

**4. SEC Filings** (Special Value)
```json
{
  "search_domain_filter": ["sec"]
}
```
- Special value `"sec"` searches SEC regulatory filings
- Includes 10-K (annual), 10-Q (quarterly), and 8-K (current) reports
- Ideal for financial analysis and due diligence

### Best Practices

**Domain vs URL Specification:**
- Use simple domain names (`example.com`) for broad filtering across entire sites
- Use complete URLs (`https://example.com/specific-page`) for granular page-level control

**Mode Selection:**
- Use **allowlist** when you know exactly which trusted sources to use
- Use **denylist** when you want broad search but need to exclude known noise
- **Cannot mix** both modes in a single request

**Subdomain Behavior:**
- Adding a main domain (`nytimes.com`) automatically includes all subdomains (`cooking.nytimes.com`)
- For subdomain-specific filtering, specify the complete subdomain

**Limits:**
- Maximum 20 domains or URLs per request
- Prioritize most authoritative sources when approaching the limit

**URL Accessibility:**
- Test that URLs in allowlist are publicly accessible
- Blocked or authentication-required URLs may impact response quality

### Common Use Cases

**Healthcare Research:**
```json
{
  "search_domain_filter": ["nih.gov", "who.int", "cdc.gov", "nejm.org"]
}
```

**Finance & SEC Filings:**
```json
{
  "search_domain_filter": ["sec", "bloomberg.com", "wsj.com", "ft.com"]
}
```

**Academic Research:**
```json
{
  "search_domain_filter": ["arxiv.org", "scholar.google.com", "pnas.org", "nature.com"]
}
```

**Legal Research:**
```json
{
  "search_domain_filter": ["justia.com", "findlaw.com", "law.cornell.edu"]
}
```

**Noise Reduction:**
```json
{
  "search_domain_filter": ["-pinterest.com", "-reddit.com", "-quora.com"]
}
```

### Examples

**Query with Allowlist:**
Target only NASA and Wikipedia for space-related research:
```bash
curl --request POST \
  --url https://api.perplexity.ai/chat/completions \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "sonar",
    "messages": [
      {"role": "user", "content": "Tell me about the James Webb Space Telescope discoveries."}
    ],
    "search_domain_filter": ["nasa.gov", "wikipedia.org", "space.com"]
  }'
```

**Query with Denylist:**
Exclude low-quality sources from renewable energy research:
```bash
curl --request POST \
  --url https://api.perplexity.ai/chat/completions \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "sonar",
    "messages": [
      {"role": "user", "content": "What are the latest advancements in renewable energy?"}
    ],
    "search_domain_filter": ["-pinterest.com", "-reddit.com", "-quora.com"]
  }'
```

**Query with SEC Filings:**
Research company financial data:
```bash
curl --request POST \
  --url https://api.perplexity.ai/chat/completions \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "sonar-pro",
    "messages": [
      {"role": "user", "content": "What are Tesla latest financial results?"}
    ],
    "search_domain_filter": ["sec"]
  }'
```

## Core Services

### Perplexity API Service (src/services/perplexityApi.ts)
- Singleton `perplexityApiService` for all Perplexity API interactions
- Handles authentication, request formation, response validation
- Built-in cost tracking and error handling

### Utility Services
- **Error Handling** (`src/types-global/errors.ts`, `src/utils/internal/errorHandler.ts`): Centralized error processing
- **Logging** (`src/utils/internal/logger.ts`): Structured logging with RequestContext
- **Security** (`src/utils/security/`): Input sanitization, rate limiting, ID generation
- **Cost Tracking** (`src/utils/perplexity-utils/costTracker.ts`): Automatic API cost estimation

## Configuration

### Required Environment Variables
- `PERPLEXITY_API_KEY` - Perplexity API authentication key

### Optional Configuration
- `MCP_TRANSPORT_TYPE` - Transport mechanism (stdio/http, default: stdio)
- `MCP_HTTP_PORT` - HTTP server port (default: 3010)
- `MCP_LOG_LEVEL` - Logging verbosity (debug/info/warn/error, default: info)
- `MCP_AUTH_MODE` - HTTP authentication method (jwt/oauth, default: jwt)
- `MCP_AUTH_SECRET_KEY` - JWT secret key (required for HTTP + JWT)

## Development Workflow

### Adding a New Tool
1. Create directory: `src/mcp-server/tools/newToolName/`
2. Create `logic.ts` with Zod schemas and pure logic function
3. Create `registration.ts` with MCP registration and error handling
4. Create `index.ts` exporting the registration function
5. Import and register in `src/mcp-server/server.ts`

### Code Requirements
- All files must begin with `@fileoverview` and `@module` JSDoc blocks
- Tool descriptions in Zod schemas are sent to LLMs - write for AI consumption
- Use TypeScript strict mode and ES module patterns (`"type": "module"` in package.json)
- Always include RequestContext in logging
- Follow "Logic Throws, Handler Catches" error pattern
- Use Zod for all input/output validation and schema definitions
- Sanitize inputs before logging using `sanitization.sanitizeForLogging()`

## Important Patterns

### Request Context Service
- Every operation creates a unique `RequestContext` with `requestId` and `timestamp`
- Pass context through entire call stack for traceability
- Example: `const context = requestContextService.createRequestContext({ operation: 'toolName' })`

### Error Handling with ErrorHandler
- Use `ErrorHandler.tryCatch()` for automatic error handling with logging
- Use `ErrorHandler.handleError()` for manual error processing
- All errors are transformed to `McpError` with standardized error codes
- Example:
  ```typescript
  return await ErrorHandler.tryCatch(
    async () => { /* logic */ },
    { operation: 'operationName', context, input: params }
  );
  ```

### Logging Best Practices
- Use structured logging with context: `logger.info(message, context)`
- Log levels: `debug`, `info`, `warning`, `error`, `fatal`
- All logs automatically include `requestId` and `timestamp` from context
- Logs are written to both console and file (in logs/ directory)