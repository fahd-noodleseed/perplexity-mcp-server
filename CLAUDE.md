# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run rebuild` - Clean and rebuild the project 
- `npm run clean` - Remove build artifacts using scripts/clean.ts
- `npm start` - Start the server using stdio transport (default)
- `npm run tree` - Generate file tree documentation

### Running via npx
- `npx perplexity-mcp-server` - Run server directly via npx without installation
- `npm install -g perplexity-mcp-server && perplexity-mcp-server` - Install globally and run

### Project Structure Generation
- `ts-node --esm scripts/tree.ts` - Generate project structure documentation

## Core Architecture

This is a **Perplexity MCP Server** that provides AI agents access to Perplexity's search-augmented generation capabilities through the Model Context Protocol (MCP). Built on the `mcp-ts-template` architecture with strict architectural mandates.

### Transport Layer
The server supports two transport mechanisms:
- **stdio** (default): Direct process communication 
- **http**: HTTP server with authentication (JWT/OAuth 2.1)

Configure via `MCP_TRANSPORT_TYPE` environment variable.

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

### Core Services

#### Perplexity API Service (src/services/perplexityApi.ts)
- Singleton `perplexityApiService` for all Perplexity API interactions
- Handles authentication, request formation, response validation
- Supports both chat completion and deep research models
- Built-in cost tracking and error handling

#### Available Tools:
- `perplexity_search` - Fast search-augmented queries with filtering options
- `perplexity_deep_research` - Exhaustive multi-source research with configurable depth

### Utility Services

#### Error Handling (src/types-global/errors.ts, src/utils/internal/errorHandler.ts)
- Standardized `McpError` objects with structured error codes
- Centralized `ErrorHandler.handleError()` for consistent error processing
- **MANDATE**: All tool handlers must use `ErrorHandler.handleError()` in catch blocks

#### Logging & Context (src/utils/internal/)
- Structured logging with `logger` singleton
- `RequestContext` for operation tracing with unique IDs
- **MANDATE**: All logging must include RequestContext for traceability

#### Security Utilities (src/utils/security/)
- Input sanitization with `sanitization` utility
- Rate limiting capabilities with `rateLimiter`
- Secure ID generation with `idGenerator`

#### Cost Tracking (src/utils/perplexity-utils/costTracker.ts)
- Automatic cost estimation for Perplexity API calls
- Integrated into `perplexityApiService` responses

## Configuration

### Required Environment Variables:
- `PERPLEXITY_API_KEY` - Perplexity API authentication key

### Optional Configuration:
- `MCP_TRANSPORT_TYPE` - Transport mechanism (stdio/http, default: stdio)
- `MCP_HTTP_PORT` - HTTP server port (default: 3010)
- `MCP_LOG_LEVEL` - Logging verbosity (debug/info/warn/error, default: info)
- `MCP_AUTH_MODE` - HTTP authentication method (jwt/oauth, default: jwt)
- `MCP_AUTH_SECRET_KEY` - JWT secret key (required for HTTP + JWT)

## Development Guidelines

### Tool Development Workflow:
1. Create tool directory in `src/mcp-server/tools/toolName/`
2. Define Zod schemas and pure logic in `logic.ts`
3. Implement MCP registration and error handling in `registration.ts`  
4. Export registration function through `index.ts`
5. Register tool in `src/mcp-server/server.ts`

### Code Quality Requirements:
- All files must begin with `@fileoverview` and `@module` JSDoc blocks
- Tool descriptions in Zod schemas are sent to LLMs - write for AI consumption
- Follow TypeScript strict mode and ES module patterns
- Use structured logging with RequestContext throughout

### Architecture Compliance:
- Logic layer: Pure functions that throw McpError on failure
- Handler layer: Wraps logic calls in try/catch, uses ErrorHandler
- Never mix error handling patterns - follow "Logic Throws, Handler Catches"
- Always pass RequestContext through the call stack
- Use centralized services (logger, ErrorHandler, perplexityApiService)

Refer to `.clinerules` for comprehensive architectural standards and detailed implementation patterns.