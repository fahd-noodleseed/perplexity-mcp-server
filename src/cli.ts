#!/usr/bin/env node

/**
 * @fileoverview CLI entry point for the Perplexity MCP Server.
 * This script serves as the executable entry point when running via npx or global installation.
 * It imports and initializes the main server application.
 * @module src/cli
 */

// Import and run the main application
import('./index.js').catch((error) => {
  console.error('Failed to start noodle-perplexity-mcp:', error);
  process.exit(1);
});