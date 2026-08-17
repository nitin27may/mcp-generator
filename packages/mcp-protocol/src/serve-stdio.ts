import { serveStdio, type ServeStdioOptions, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { buildServerFactory } from './build-server-factory.js';
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
  const handle: StdioServerHandle = serveStdio(buildServerFactory(tools, serverInfo), {
    legacy: 'reject',
    ...(options.onError ? { onerror: options.onError } : {}),
    ...(options.transport ? { transport: options.transport } : {}),
  });

  return { close: () => handle.close() };
}
