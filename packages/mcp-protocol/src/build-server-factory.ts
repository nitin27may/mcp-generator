import type { CallerIdentity } from '@mcpgen/domain';
import { fromJsonSchema, McpServer, type AuthInfo, type CallToolResult } from '@modelcontextprotocol/server';
import type { ProtocolTool, ServerInfo } from './protocol-tool.js';

/**
 * The one place an SDK `AuthInfo` becomes a `CallerIdentity`. Everything downstream of
 * here is protocol-agnostic, which is what ADR-0004's adapter boundary and ADR-0005's
 * auth-plane separation both require.
 */
function toCallerIdentity(authInfo: AuthInfo | undefined): CallerIdentity | undefined {
  if (!authInfo) return undefined;
  const subject = authInfo.extra?.['subject'];
  return {
    clientId: authInfo.clientId,
    scopes: authInfo.scopes,
    token: authInfo.token,
    ...(typeof authInfo.expiresAt === 'number' ? { expiresAt: authInfo.expiresAt } : {}),
    ...(typeof subject === 'string' ? { subject } : {}),
  };
}

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
        (args, ctx) =>
          tool.execute(
            args as Record<string, unknown>,
            toCallerIdentity(ctx.http?.authInfo),
          ) as unknown as Promise<CallToolResult>,
      );
    }
    return server;
  };
}
