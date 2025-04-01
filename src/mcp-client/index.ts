/**
 * Barrel file for the MCP Client module.
 * Exports the primary functions for creating, connecting, and managing MCP client instances.
 */

export {
  connectMcpClient,
  disconnectMcpClient,
  disconnectAllMcpClients,
  type ConnectedMcpClient // Export the type alias as well
} from './client.js';

// Optionally, re-export config types or loader functions if needed externally
export {
  type McpServerConfigEntry,
  loadMcpClientConfig,
  getMcpServerConfig
} from './configLoader.js';

// Optionally, re-export transport functions if direct access is needed (less common)
// export { getClientTransport, createStdioClientTransport } from './transport.js';
