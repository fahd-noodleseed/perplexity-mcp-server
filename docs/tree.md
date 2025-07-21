# perplexity-mcp-server - Directory Structure

Generated on: 2025-07-21 15:48:03

```
perplexity-mcp-server
├── .github
│   ├── workflows
│   │   └── publish.yml
│   └── FUNDING.yml
├── docs
│   └── tree.md
├── scripts
│   ├── clean.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-server
│   │   ├── tools
│   │   │   ├── perplexityDeepResearch
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   └── perplexitySearch
│   │   │       ├── index.ts
│   │   │       ├── logic.ts
│   │   │       └── registration.ts
│   │   ├── transports
│   │   │   ├── auth
│   │   │   │   ├── core
│   │   │   │   │   ├── authContext.ts
│   │   │   │   │   ├── authTypes.ts
│   │   │   │   │   └── authUtils.ts
│   │   │   │   ├── strategies
│   │   │   │   │   ├── jwt
│   │   │   │   │   │   └── jwtMiddleware.ts
│   │   │   │   │   └── oauth
│   │   │   │   │       └── oauthMiddleware.ts
│   │   │   │   └── index.ts
│   │   │   ├── httpErrorHandler.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   ├── index.ts
│   │   └── perplexityApi.ts
│   ├── types-global
│   │   └── errors.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── errorHandler.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── requestContext.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   └── tokenCounter.ts
│   │   ├── network
│   │   │   ├── fetchWithTimeout.ts
│   │   │   └── index.ts
│   │   ├── parsing
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   └── jsonParser.ts
│   │   ├── perplexity-utils
│   │   │   └── costTracker.ts
│   │   ├── scheduling
│   │   │   ├── index.ts
│   │   │   └── scheduler.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   └── index.ts
│   └── index.ts
├── .clinerules
├── .env.example
├── .gitignore
├── .ncurc.json
├── LICENSE
├── mcp-config.json.example
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
└── tsconfig.json
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._
