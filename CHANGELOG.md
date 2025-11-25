## [1.6.0](https://github.com/fahd-noodleseed/perplexity-mcp-server/compare/v1.5.2...v1.6.0) (2025-11-25)

### Features

* add response caching and automated releases ([1aa057e](https://github.com/fahd-noodleseed/perplexity-mcp-server/commit/1aa057ec0827c389fb5723748b82c455a6ee1cbd))

### Bug Fixes

* add missing conventional-changelog-conventionalcommits dependency ([7044392](https://github.com/fahd-noodleseed/perplexity-mcp-server/commit/704439272321501462f96c3efcc4e55a6b52afb9))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-08-30

### Changed
- **Package Name**: Renamed package from `perplexity-mcp-server` to `noodle-perplexity-mcp` for npm publication
- **Tool Names**: Updated tool implementations to use `perplexity_ask` and `perplexity_think_and_analyze` (replacing the previous `perplexity_search` and `perplexity_deep_research` references in documentation)
- **CLI Command**: Updated binary name from `perplexity-mcp-server` to `noodle-perplexity-mcp`
- **Installation**: Added npm installation options with npx support for easier deployment
- **Documentation**: Updated all references to reflect the new package name and correct tool names

## [1.2.1] - 2025-07-21

### Fixed
- **Schema Validation**: Patched the Zod schema for `perplexity_ask` and `perplexity_think_and_analyze` tools to correctly handle `null` values for the `date` field in search results returned by the Perplexity API. This resolves a critical validation error that caused tool execution to fail.

## [1.2.0] - 2025-07-21

### Changed
- **Architectural Refactor**: Overhauled the entire server architecture to align with the `mcp-ts-template v1.7.1` standard. This enforces a strict "Logic Throws, Handler Catches" pattern, where core logic is pure and error handling is centralized in the registration layer.
- **Tool Registration**: Updated all tools to use the modern `server.registerTool` method from the MCP SDK, which includes mandatory output schema definitions for improved type safety and LLM interaction.
- **Error Handling**: Replaced all `ErrorHandler.tryCatch` wrappers with standard `try...catch` blocks in the tool registration handlers, delegating error processing to a centralized `ErrorHandler.handleError` call.
- **Response Formatting**: Enhanced tool response handlers to intelligently parse `<think>` blocks from the model's output and to format `searchResults` into clear, user-facing citations.
- **Server Initialization**: Streamlined the main server startup sequence in `src/mcp-server/server.ts` for improved clarity and robustness.
- **HTTP Transport**: Refactored the HTTP transport's port-binding logic (`startHttpServerWithRetry`) to be more resilient and avoid race conditions.
- **Dependencies**: Updated all major dependencies to their latest versions, including `@modelcontextprotocol/sdk` (v1.16.0), `@hono/node-server` (v1.17.1), and `openai` (v5.10.1).

### Added
- **Architectural Mandate**: Added a new `.clinerules` file that formally documents the project's architectural standards and developer mandates.
- **Structured Output**: Both `perplexity_ask` and `perplexity_think_and_analyze` tools now return a structured output object (`PerplexitySearchResponseSchema`) that includes detailed `searchResults` in addition to the raw text response.

### Fixed
- **Type Safety**: Improved type safety and code quality across various internal utilities, including the logger, scheduler, and parsers.
