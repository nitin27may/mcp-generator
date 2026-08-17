import { fromJsonSchema, McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import type { ProtocolTool, ServerInfo } from './protocol-tool.js';

/**
 * Shared between the stdio and HTTP transports (ADR-0009: same factory
 * backs both eras and both transports, so they can never register tools
 * differently by accident).
 */
export function buildServerFactory(tools: readonly ProtocolTool[], serverInfo: ServerInfo): () => McpServer {
  return () => {
    const server = new McpServer(serverInfo);
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: fromJsonSchema(tool.inputSchema) },
        // `ProtocolToolResult` is our public contract; the SDK's handler
        // return type is a stricter internal union that also allows
        // `InputRequiredResult` (MRTR — not implemented until P4-W08-E01).
        // Cast at this one boundary rather than importing the SDK's
        // internal shape into our public type.
        (args) => tool.execute(args as Record<string, unknown>) as unknown as Promise<CallToolResult>,
      );
    }
    return server;
  };
}
