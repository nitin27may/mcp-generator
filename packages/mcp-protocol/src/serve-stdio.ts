import { fromJsonSchema, McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { serveStdio, type ServeStdioOptions, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import type { ProtocolTool, ServerInfo } from './protocol-tool.js';

export interface McpStdioServerHandle {
  close(): Promise<void>;
}

export interface ServeToolsOverStdioOptions {
  readonly onError?: (error: Error) => void;
  /**
   * Escape hatch for tests: inject a non-stdio `Transport` (e.g. one half of
   * `InMemoryTransport.createLinkedPair()`) so the exact same registration
   * and era-handling code runs without a real subprocess. Never set this in
   * production code — omitting it is what makes `serveStdio` bind real
   * process stdio.
   */
  readonly transport?: ServeStdioOptions['transport'];
}

function buildFactory(tools: readonly ProtocolTool[], serverInfo: ServerInfo) {
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

/**
 * Starts serving `tools` over stdio via the modern factory path (ADR-0009).
 *
 * `legacy: 'reject'` is passed explicitly. The SDK's own default (`'serve'`)
 * silently accommodates the legacy 2025 era too (research notes §14) — which
 * would contradict TIP §27's `legacyMode: "disabled"` for MVP. Enforcing our
 * documented policy takes one line here; the alternative was documenting a
 * policy the code didn't actually apply.
 */
export function serveToolsOverStdio(
  tools: readonly ProtocolTool[],
  serverInfo: ServerInfo,
  options: ServeToolsOverStdioOptions = {},
): McpStdioServerHandle {
  const handle: StdioServerHandle = serveStdio(buildFactory(tools, serverInfo), {
    legacy: 'reject',
    ...(options.onError ? { onerror: options.onError } : {}),
    ...(options.transport ? { transport: options.transport } : {}),
  });

  return { close: () => handle.close() };
}
