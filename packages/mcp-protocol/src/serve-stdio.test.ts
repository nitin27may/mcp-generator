import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { serveToolsOverStdio, type McpStdioServerHandle } from './serve-stdio.js';
import type { ProtocolTool } from './protocol-tool.js';

/**
 * Drives the exact production code path (serveStdio + registerTool +
 * fromJsonSchema) via InMemoryTransport.createLinkedPair() instead of a
 * spawned subprocess — fast and in-process, but not a mock: it is the real
 * SDK, the real era-detection logic, and the real registration path.
 */

const echoTool: ProtocolTool = {
  name: 'echo',
  description: 'Echoes its input',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
    additionalProperties: false,
  },
  execute: async (args) => ({ content: [{ type: 'text', text: String(args.message) }], resultType: 'complete' }),
};

let handle: McpStdioServerHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

/**
 * The SDK client defaults to the legacy era too — `versionNegotiation` is a
 * *constructor* option (not a `connect()` option), and its default is
 * `'legacy'`, byte-identical to pre-2026-07-28 behavior with no probe
 * (research notes §15). Pinning here means a mismatch fails loudly rather
 * than silently negotiating down to legacy.
 */
function modernClient(info: { name: string; version: string }): Client {
  return new Client(info, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
}

describe('serveToolsOverStdio — via the high-level Client', () => {
  it('lists the registered tool with its input schema published verbatim', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    handle = serveToolsOverStdio([echoTool], { name: 'test-server', version: '0.0.1' }, { transport: serverTransport });

    const client = modernClient({ name: 'test-client', version: '0.0.1' });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('echo');
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    });

    await client.close();
  });

  it('calling the tool invokes execute() and returns its result', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    handle = serveToolsOverStdio([echoTool], { name: 'test-server', version: '0.0.1' }, { transport: serverTransport });

    const client = modernClient({ name: 'test-client', version: '0.0.1' });
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'echo', arguments: { message: 'hello' } });
    expect(result).toMatchObject({ content: [{ type: 'text', text: 'hello' }] });

    await client.close();
  });

  it('rejects a call with missing required input — validated by the SDK itself, not our code', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    handle = serveToolsOverStdio([echoTool], { name: 'test-server', version: '0.0.1' }, { transport: serverTransport });

    const client = modernClient({ name: 'test-client', version: '0.0.1' });
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'echo', arguments: {} });
    expect(result.isError).toBe(true);

    await client.close();
  });
});

describe('serveToolsOverStdio — protocol era (ADR-0009, research notes §14)', () => {
  function driveRaw(clientTransport: InMemoryTransport, message: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      clientTransport.onmessage = (msg) => resolve(msg as unknown as Record<string, unknown>);
      void clientTransport.start().then(() => clientTransport.send(message as never));
    });
  }

  it('server/discover confirms the modern 2026-07-28 revision is served', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    handle = serveToolsOverStdio([echoTool], { name: 'test-server', version: '0.0.1' }, { transport: serverTransport });

    const response = await driveRaw(clientTransport, {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'raw-test', version: '1.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    });

    const result = response.result as { supportedVersions: string[] };
    expect(result.supportedVersions).toContain('2026-07-28');
  });

  it('rejects a legacy initialize opening — legacy: "reject" enforces TIP §27 legacyMode:"disabled"', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    handle = serveToolsOverStdio([echoTool], { name: 'test-server', version: '0.0.1' }, { transport: serverTransport });

    const response = await driveRaw(clientTransport, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'raw-legacy-test', version: '1.0' },
      },
    });

    // Rejection means an error response, not a normal InitializeResult.
    expect(response.error).toBeDefined();
    expect(response.result).toBeUndefined();
  });
});
