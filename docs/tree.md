# perplexity-mcp-server - Directory Structure

Generated on: 2025-04-01 14:29:23


```
perplexity-mcp-server
├── docs
    └── tree.md
├── scripts
    ├── clean.ts
    └── tree.ts
├── src
    ├── config
    │   └── index.ts
    ├── mcp-client
    │   ├── client.ts
    │   ├── configLoader.ts
    │   ├── index.ts
    │   ├── mcp-config.json.example
    │   └── transport.ts
    ├── mcp-server
    │   ├── tools
    │   │   └── echoTool
    │   │   │   ├── echoToolLogic.ts
    │   │   │   ├── index.ts
    │   │   │   └── registration.ts
    │   └── server.ts
    ├── services
    │   ├── index.ts
    │   └── perplexityApi.ts
    ├── types-global
    │   ├── errors.ts
    │   ├── mcp.ts
    │   └── tool.ts
    ├── utils
    │   ├── costTracker.ts
    │   ├── errorHandler.ts
    │   ├── idGenerator.ts
    │   ├── index.ts
    │   ├── logger.ts
    │   ├── rateLimiter.ts
    │   ├── requestContext.ts
    │   └── sanitization.ts
    └── index.ts
├── .clinerules
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
└── tsconfig.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
