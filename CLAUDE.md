# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run rebuild` - Clean and rebuild the project
- `npm run clean` - Remove dist/ and logs/ directories
- `npm start` - Start the server using stdio transport (default)
- `npm test` - Run tests (placeholder - tests not yet implemented)

### Running via npx
- `npx noodle-perplexity-mcp` - Run server directly without installation
- `npm install -g noodle-perplexity-mcp && noodle-perplexity-mcp` - Install globally and run

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
  - `searchRecency`: Filter by time (week, month, year, etc.)
  - `searchDomain`: Limit to specific domain
  - `isAcademicSearch`: Enable scholarly sources

### `perplexity_think_and_analyze` (sonar-reasoning-pro model)
- **Purpose**: Logical reasoning, step-by-step analysis, and structured problem-solving
- **Best for**: Mathematical problems, code analysis, logical puzzles, systematic thinking
- **Key Parameters**:
  - `query`: The problem to analyze
  - `showThinking`: Expose internal reasoning process (default: false)
  - `searchRecency`: Filter by time
  - `searchDomain`: Limit to specific domain

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
- Use TypeScript strict mode and ES module patterns
- Always include RequestContext in logging
- Follow "Logic Throws, Handler Catches" error pattern