# Perplexity MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-^1.15.0-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.1.0-blue.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/cyanheads/perplexity-mcp-server/issues)
[![GitHub](https://img.shields.io/github/stars/cyanheads/perplexity-mcp-server?style=social)](https://github.com/cyanheads/perplexity-mcp-server)

An advanced Model Context Protocol (MCP) server that provides tools to interact with the [Perplexity AI API](https://docs.perplexity.ai/docs/getting-started). This server enables AI agents to leverage Perplexity's powerful search-augmented and deep research capabilities through a standardized protocol. It supports both `stdio` and `http` transports, includes robust authentication options, and is built on a modular, type-safe architecture.

## Core Features

- **Dual Perplexity Tools**:
  - `perplexity_search`: For fast, search-augmented answers.
  - `perplexity_deep_research`: For comprehensive, multi-source research reports on complex topics.
- **Flexible Transports**:
  - **Stdio**: For direct integration with local clients (e.g., IDE extensions).
  - **HTTP**: A streamable HTTP transport for network-based access, featuring session management.
- **Robust Utilities**: A refactored, modular utility library for logging, error handling, security, and more.
- **Authentication**: Secure your HTTP transport with JWT or OAuth 2.1 middleware.
- **Type Safety**: Fully written in TypeScript for improved reliability and developer experience.
- **Cost Tracking**: Built-in utility to estimate the cost of Perplexity API calls.

> **.clinerules**: This repository includes a [.clinerules](.clinerules) file that serves as a developer cheat sheet for LLM coding agents (like Cline) providing quick references for codebase patterns, file locations, and code snippets specific to this project.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
  - [Stdio Transport](#stdio-transport)
  - [HTTP Transport](#http-transport)
- [Project Structure](#project-structure)
- [Tool Documentation](#tool-documentation)
  - [perplexity_search](#perplexity_search)
  - [perplexity_deep_research](#perplexity_deep_research)
- [Development Guidelines](#development-guidelines)
- [License](#license)

## Installation

### Prerequisites

- [Node.js (v18+)](https://nodejs.org/)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A Perplexity API Key (see [Configuration](#configuration))

### Setup

1.  Clone this repository:
    ```bash
    git clone https://github.com/cyanheads/perplexity-mcp-server.git
    cd perplexity-mcp-server
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Build the project:
    ```bash
    npm run build
    ```

## Configuration

Create a `.env` file in the project root by copying `.env.example`.

### Core Configuration

| Variable                 | Description                                                              | Default Value             |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------- |
| `PERPLEXITY_API_KEY`     | **Required.** Your API key for Perplexity.                               | `""`                      |
| `LOG_LEVEL`              | Logging level: `debug`, `info`, `warn`, `error`.                         | `info`                    |
| `NODE_ENV`               | Runtime environment: `development` or `production`.                      | `development`             |
| `PERPLEXITY_DEFAULT_MODEL`| Default model for `perplexity_search`.                                   | `sonar-reasoning-pro`     |
| `PERPLEXITY_DEFAULT_EFFORT`| Default effort for `perplexity_deep_research`: `low`, `medium`, `high`. | `medium`                  |

### Transport Configuration

| Variable                | Description                                                              | Default Value |
| ----------------------- | ------------------------------------------------------------------------ | ------------- |
| `MCP_TRANSPORT_TYPE`    | Transport to use: `stdio` or `http`.                                     | `stdio`       |
| `MCP_HTTP_PORT`         | Port for the HTTP server.                                                | `3010`        |
| `MCP_HTTP_HOST`         | Host for the HTTP server.                                                | `127.0.0.1`   |
| `MCP_ALLOWED_ORIGINS`   | Comma-separated list of allowed origins for CORS.                        | `""`          |

### Authentication Configuration (for HTTP Transport)

| Variable                | Description                                                              | Default Value |
| ----------------------- | ------------------------------------------------------------------------ | ------------- |
| `MCP_AUTH_MODE`         | Authentication mode: `jwt` or `oauth`.                                   | `jwt`         |
| `MCP_AUTH_SECRET_KEY`   | **Required for `jwt` mode in production.** A secure secret key (min 32 chars). | `""`          |
| `OAUTH_ISSUER_URL`      | **Required for `oauth` mode.** The URL of the OAuth issuer.              | `""`          |
| `OAUTH_AUDIENCE`        | **Required for `oauth` mode.** The audience claim for token validation.    | `""`          |
| `OAUTH_JWKS_URI`        | Optional. The URI for the JSON Web Key Set. Defaults to issuer's well-known endpoint. | `""`          |

## Running the Server

### Stdio Transport

This is the default mode, ideal for local clients.

1.  Ensure `MCP_TRANSPORT_TYPE` is set to `stdio` or is omitted from your `.env` file.
2.  Add the server to your MCP client configuration:

    ```json
    {
      "mcpServers": {
        "perplexity": {
          "command": "node",
          "args": ["/path/to/perplexity-mcp-server/dist/index.js"],
          "env": {
            "PERPLEXITY_API_KEY": "YOUR_PERPLEXITY_API_KEY"
          }
        }
      }
    }
    ```

### HTTP Transport

This mode runs a persistent server accessible over the network.

1.  Set `MCP_TRANSPORT_TYPE=http` in your `.env` file.
2.  Configure `MCP_HTTP_PORT` and `MCP_HTTP_HOST` as needed.
3.  If you require security, configure the `MCP_AUTH_*` and/or `OAUTH_*` variables.
4.  Start the server:
    ```bash
    npm start
    ```
    The server will be available at `http://<host>:<port>/mcp`.

## Project Structure

The codebase is organized into a modular structure within the `src/` directory. For a detailed, up-to-date view of the project structure, run:

```bash
npm run tree
```

This will update the `docs/tree.md` file.

## Tool Documentation

### `perplexity_search`

Performs a search-augmented query using the Perplexity Search API. It's best for quick, fact-based questions.

**Input Parameters:**

| Parameter                  | Type     | Required | Description                                                              |
| -------------------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `query`                    | string   | Yes      | The natural language query for Perplexity.                               |
| `return_related_questions` | boolean  | No       | If true, suggests related questions in the response. Default: `false`.   |
| `search_recency_filter`    | string   | No       | Restricts search to a timeframe: `day`, `week`, `month`, `year`.         |
| `search_domain_filter`     | string[] | No       | A list of domains to restrict or exclude from the search.                |
| `search_after_date_filter` | string   | No       | Filters results published after a specific date (MM/DD/YYYY).            |
| `search_before_date_filter`| string   | No       | Filters results published before a specific date (MM/DD/YYYY).           |
| `search_mode`              | string   | No       | Set to `academic` to prioritize scholarly sources.                       |
| `showThinking`             | boolean  | No       | If true, includes the model's internal reasoning in the response.        |

### `perplexity_deep_research`

Performs an exhaustive, multi-source research query. This tool is for complex topics requiring in-depth analysis and report generation.

**Input Parameters:**

| Parameter          | Type   | Required | Description                                                              |
| ------------------ | ------ | -------- | ------------------------------------------------------------------------ |
| `query`            | string | Yes      | The detailed research query or topic.                                    |
| `reasoning_effort` | string | No       | Controls research depth: `low`, `medium`, `high`. Default: `medium`.     |

## Development Guidelines

This project uses a modular structure. When adding new features:

-   **Tools**: Create a new directory under `src/mcp-server/tools/`. Define the `logic.ts`, `registration.ts`, and `index.ts` files. Register the new tool in `src/mcp-server/server.ts`.
-   **Utilities**: Add new utility functions to the appropriate subdirectory under `src/utils/` and export them from the corresponding `index.ts` file.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with the <a href="https://modelcontextprotocol.io/">Model Context Protocol</a>
</div>
