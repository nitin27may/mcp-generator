import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  originValidation,
  toNodeHandler,
  type NodeIncomingMessageLike,
} from '@modelcontextprotocol/node';
import { buildServerFactory } from './build-server-factory.js';
import type { ProtocolTool, ServerInfo } from './protocol-tool.js';

export interface McpHttpServerHandle {
  /** The MCP endpoint URL — always `${scheme}://${host}:${port}/mcp` (TIP §26.3). */
  readonly url: string;
  close(): Promise<void>;
}

export interface ServeToolsOverHttpOptions {
  /** @default '127.0.0.1' — TIP §26.2: local mode binds loopback only, never all interfaces. */
  readonly host?: string;
  /** @default 0 (an ephemeral port) */
  readonly port?: number;
  readonly onError?: (error: Error) => void;
  /**
   * Hostnames the `Host` header may name. @default localhost-only
   * (`localhostHostValidation()` — `localhost`, `127.0.0.1`, `[::1]`).
   */
  readonly allowedHostnames?: readonly string[];
  /**
   * Hostnames the `Origin` header may name, when present. @default
   * localhost-only. A request without an `Origin` header always passes —
   * non-browser MCP clients don't send one; this guard exists for the
   * DNS-rebinding threat, which is browser-JS-initiated.
   */
  readonly allowedOriginHostnames?: readonly string[];
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Starts serving `tools` over Streamable HTTP (TIP §26) via the modern
 * `createMcpHandler` factory path — the HTTP counterpart to
 * `serveToolsOverStdio`, backed by the identical `buildServerFactory` so the
 * two transports can never register tools differently (ADR-0009).
 *
 * `legacy: 'reject'` mirrors the stdio transport's policy (TIP §27
 * `legacyMode: "disabled"`). Origin/Host validation is NOT automatic —
 * `createMcpHandler`'s own documentation states the entry is "deliberately
 * validation-free" and shows composing `@modelcontextprotocol/node`'s guards
 * in front of it; omitting this step would silently ship a Streamable HTTP
 * server without the DNS-rebinding protection FR-HTTP-MCP-004 requires.
 * `/health` and `/ready` are served outside the MCP endpoint (TIP §26.3) —
 * mixing health checks into `/mcp`'s protocol semantics is exactly what that
 * section warns against.
 */
export function serveToolsOverHttp(
  tools: readonly ProtocolTool[],
  serverInfo: ServerInfo,
  options: ServeToolsOverHttpOptions = {},
): Promise<McpHttpServerHandle> {
  const handler = createMcpHandler(buildServerFactory(tools, serverInfo), {
    legacy: 'reject',
    ...(options.onError ? { onerror: options.onError } : {}),
  });
  const nodeHandler = toNodeHandler(handler, options.onError ? { onerror: options.onError } : {});

  const validateHost = options.allowedHostnames
    ? hostHeaderValidation([...options.allowedHostnames])
    : localhostHostValidation();
  const validateOrigin = options.allowedOriginHostnames
    ? originValidation([...options.allowedOriginHostnames])
    : localhostOriginValidation();

  const server: Server = createServer((rawReq: IncomingMessage, res: ServerResponse) => {
    // Node's IncomingMessage types method/url as `string | undefined`; the
    // SDK's duck-typed NodeIncomingMessageLike declares them non-optional
    // (`method?: string`, no explicit `undefined`) — a structural mismatch
    // that only `exactOptionalPropertyTypes` surfaces, not a real one at
    // runtime (a live request always has both). Single cast at the
    // boundary rather than patching field by field.
    const req = rawReq as unknown as NodeIncomingMessageLike & IncomingMessage;
    if (!validateHost(req, res)) return;
    if (!validateOrigin(req, res)) return;

    if (req.method === 'GET' && (req.url === '/health' || req.url === '/ready')) {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.url !== '/mcp') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    void nodeHandler(req, res);
  });

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://${host}:${address.port}/mcp`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
