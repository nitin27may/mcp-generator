/**
 * The shape this package needs to register a tool with the SDK — deliberately
 * NOT `mcp-runtime`'s richer `RuntimeTool` (TIP §28). `mcp-runtime` depends on
 * `mcp-protocol` (TIP §91), not the reverse, so this package cannot import
 * `mcp-runtime`'s types without creating a cycle. `mcp-runtime` adapts its
 * own tool objects into this narrower shape when calling `serveToolsOverStdio`.
 */
export interface ProtocolToolResult {
  readonly content: ReadonlyArray<{ readonly type: 'text'; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
  /**
   * `'complete'` for every P0 tool — MRTR (`InputRequiredResult`, a distinct
   * `resultType`) lands with confirmation support at P4-W08-E01. The SDK
   * injects this into the wire response regardless; declaring it here is
   * what satisfies its handler-return type statically.
   */
  readonly resultType: 'complete';
}

export interface ProtocolTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema 2020-12, already MCP-sanitized by schema-normalizer. */
  readonly inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ProtocolToolResult>;
}

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}
