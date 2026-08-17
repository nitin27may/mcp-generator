# MCP TypeScript SDK v2 — empirical API notes

| Field | Value |
|---|---|
| Probe date | 2026-08-17 |
| Method | Installed the packages, enumerated runtime exports and shipped `.d.ts`, ran a real server + client over stdio, and drove the raw JSON-RPC wire by hand |
| Packages | `@modelcontextprotocol/core@2.0.0`, `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/client@2.0.0`, `zod@4.4.3` |
| Node | v22.23.2 |

**Status: this file is the source of truth for how we use the SDK.** The published READMEs and docs
site are reference material. Where they disagree with what ran here, this file wins. Everything below
was observed, not read.

---

## 1. Package identity — the thing that caused a false alarm

There are two distributions, and picking the wrong one produces a wrong conclusion about the whole
project.

| Package | Latest | Status |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | **Legacy.** Single package. Caps at protocol 2025-11-25. |
| `@modelcontextprotocol/{core,server,client}` | 2.0.0 (2026-07-27) | **Current.** Split packages. Implements 2026-07-28. |

An earlier pass inspected `@modelcontextprotocol/sdk`, found `LATEST_PROTOCOL_VERSION = '2025-11-25'`,
and concluded the SDK could not speak our target revision. That conclusion was wrong because the
package was wrong.

## 2. The constant that misleads

```js
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS,
         DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from '@modelcontextprotocol/server';

LATEST_PROTOCOL_VERSION             // "2025-11-25"
DEFAULT_NEGOTIATED_PROTOCOL_VERSION // "2025-03-26"
SUPPORTED_PROTOCOL_VERSIONS         // ["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]
```

`LATEST_PROTOCOL_VERSION` is the **latest legacy-era version**, not the SDK's capability ceiling.
2026-07-28 does not appear in `SUPPORTED_PROTOCOL_VERSIONS` because that list describes the
`initialize`-handshake era only.

Internally (not exported) the SDK carries:

```js
FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28"
MODERN_WIRE_REVISION          = "2026-07-28"
```

and models two eras explicitly: `type ProtocolEra = 'legacy' | 'modern'`.

**Consequence:** never assert our protocol target against `LATEST_PROTOCOL_VERSION`. It would fail
while the server is correctly serving 2026-07-28. Determine the era from behaviour instead — see §3.

## 3. Two entry points, two eras — the central finding

The same `McpServer` serves a different protocol era depending on how it is started.

### Legacy era — `connect(transport)`

```js
const server = new McpServer({ name: 'x', version: '1.0.0' });
await server.connect(new StdioServerTransport());
```

Observed:

```jsonc
// → initialize
{"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true}},
           "serverInfo":{"name":"probe-server","version":"0.0.1"}}}
// → server/discover
{"error":{"code":-32601,"message":"Method not found"}}
```

### Modern era — `serveStdio(factory)`

```js
import { serveStdio } from '@modelcontextprotocol/server/stdio';

serveStdio(() => {
  const server = new McpServer({ name: 'x', version: '1.0.0' });
  server.registerTool(/* ... */);
  return server;                 // a factory, not an instance
});
```

Observed:

```jsonc
// → server/discover
{"result":{"supportedVersions":["2026-07-28"],
           "capabilities":{"tools":{"listChanged":true}},
           "resultType":"complete","ttlMs":0,"cacheScope":"private",
           "_meta":{"io.modelcontextprotocol/serverInfo":{"name":"probe-server","version":"0.0.1"}}}}
// → tools/call, no initialize first
{"result":{"content":[{"type":"text","text":"{\"customer_id\":\"c-7\"}"}],
           "resultType":"complete",
           "_meta":{"io.modelcontextprotocol/serverInfo":{...}}}}
```

`supportedVersions: ["2026-07-28"]` — the target revision, confirmed on the wire.

`serveStdio` takes a **factory** (`McpServerFactory`), which matches the modern era's statelessness:
a server can be constructed per request rather than held across a session.

```ts
declare function serveStdio(factory: McpServerFactory, options?: ServeStdioOptions): StdioServerHandle
```

**House rule:** the modern path is `serveStdio(factory)`. `connect()` is legacy and is not what we
ship. See [ADR-0009](../adr/0009-mcp-sdk-v2-and-modern-era.md).

## 4. Tool registration from raw JSON Schema

Two overloads exist:

```ts
registerTool<OutputArgs extends StandardSchemaWithJSON,
             InputArgs  extends StandardSchemaWithJSON | undefined>(name, config, cb)
registerTool<InputArgs  extends ZodRawShape, OutputArgs ...>(name, config, cb)
```

We generate schemas dynamically, so the Zod overload is useless to us. The bridge is:

```ts
declare function fromJsonSchema<T = unknown>(
  schema: JsonSchemaType,
  validator?: jsonSchemaValidator
): StandardSchemaWithJSON<T, T>
```

Verified working:

```js
server.registerTool('get_customer', {
  description: 'Fetch a customer by id',
  inputSchema: fromJsonSchema({
    type: 'object',
    properties: {
      customer_id: { type: 'string', description: 'Customer identifier' },
      expand: { type: 'string', enum: ['orders', 'invoices'] },
    },
    required: ['customer_id'],
    additionalProperties: false,
  }),
}, async (args) => ({
  content: [{ type: 'text', text: `...` }],
  structuredContent: { id: args.customer_id, ok: true },
}));
```

The schema **round-trips verbatim** into `tools/list` — including `description`, `enum`,
`additionalProperties`, and unknown keywords. This is precisely the contract `schema-normalizer`
needs: it emits JSON Schema 2020-12, and the SDK publishes it unchanged.

Also available: `McpServer#toolInputSchemaJson(name)` returns the JSON-serialized `inputSchema`, and
the class memoizes the conversion per tool.

## 5. The SDK validates tool input. Do not reimplement it.

Calling with a missing required property:

```json
{"content":[{"type":"text","text":"Input validation error: Invalid arguments for tool get_customer: data must have required property 'customer_id'"}],"isError":true}
```

Violating an enum:

```json
{"content":[{"type":"text","text":"Input validation error: Invalid arguments for tool get_customer: data/expand must be equal to one of the allowed values"}],"isError":true}
```

Observations that matter:

- Validation happens **inside** the SDK, against the JSON Schema we supplied.
- Failure is a **result** with `isError: true`, not a thrown exception. Our runtime must not assume it
  can catch a throw.
- Messages are Ajv-shaped (`data must have required property`). The validator is pluggable:
  `ServerOptions.jsonSchemaValidator`, with providers at `@modelcontextprotocol/server/validators/ajv`
  and `.../validators/cf-worker`.

**Consequence for `mcp-runtime`:** input validation is the SDK's job. Our `ExecutionContext` starts
*after* arguments are already valid. This removes a planned responsibility rather than adding one.

## 6. `x-mcp-header` passes through, unvalidated

An `x-mcp-header` annotation survives `fromJsonSchema` → `tools/list` byte-for-byte:

```json
"region": { "type": "string", "x-mcp-header": "Region" }
```

The SDK does **not** appear to enforce the specification's constraints on it (primitive types only,
`number` prohibited, statically reachable via `properties` only, case-insensitively unique, valid HTTP
field-name token). Since a conforming *client* must exclude tools with invalid annotations from
`tools/list`, an unvalidated annotation makes the tool silently vanish at runtime.

**Consequence:** `FR-BIND-007` stands in full. We validate at configuration time. This is ours, not
the SDK's.

## 7. Transports and HTTP

Server exports, relevant subset:

| Symbol | Notes |
|---|---|
| `StdioServerTransport`, `serveStdio` | `@modelcontextprotocol/server/stdio` |
| `PerRequestHTTPServerTransport` | Modern per-request HTTP shape (2026-07-28) |
| `WebStandardStreamableHTTPServerTransport` | Web-standard `Request`/`Response` variant |
| `createMcpHandler` | Handler factory for HTTP hosting |
| `InMemoryTransport`, `InMemoryServerEventBus` | Test transports — useful for fast unit tests without spawning |

There is **no** `./http` subpath; HTTP transports come from the main entry.

## 8. The SDK already owns things we had planned to build

Checked against TIP §26.2, §92.2, §92.3, §92.4 before writing any adapter code, per ADR-0004's intent.

| Responsibility | Owner | Evidence |
|---|---|---|
| Tool input validation against JSON Schema | **SDK** | §5 |
| JSON Schema → tool schema publication | **SDK** | `fromJsonSchema`, §4 |
| Origin / Host header validation | **SDK** | `validateOriginHeader`, `validateHostHeader`, `originValidationResponse`, `hostHeaderValidationResponse`, `localhostAllowedOrigins`, `localhostAllowedHostnames` |
| Era classification and legacy fallback | **SDK** | `classifyInboundRequest`, `isLegacyRequest`, `legacyStatelessFallback`, `ProtocolEra` |
| MRTR input requests | **SDK** | `inputRequired`, `inputResponse`, `isInputRequiredResult`, `InputRequiredResult`, `InputRequiredSpec` |
| Modern `_meta` field keys | **SDK** | `PROTOCOL_VERSION_META_KEY`, `CLIENT_INFO_META_KEY`, `CLIENT_CAPABILITIES_META_KEY`, `SERVER_INFO_META_KEY`, `SUBSCRIPTION_ID_META_KEY` |
| Subscriptions / listen | **SDK** | `SubscriptionsListenRequest`, `SubscriptionFilter`, `SubscriptionsAcknowledgedNotification` |
| Tasks extension | **SDK** | `Task`, `CreateTaskResult`, `GetTaskRequest`, `ListTasksRequest`, `RELATED_TASK_META_KEY`, `isTaskAugmentedRequestParams` |
| Plane A bearer auth / audience | **SDK** | `requireBearerAuth`, `verifyBearerToken`, `buildOAuthProtectedResourceMetadata`, `checkResourceAllowed` |
| Protocol error types | **SDK** | `UnsupportedProtocolVersionError`, `MissingRequiredClientCapabilityError`, `ProtocolError`, `SdkHttpError` |
| Elicitation | **SDK** | `ElicitRequest`, `ElicitResult`, `UrlElicitationRequiredError` |
| **`x-mcp-header` constraint validation** | **Us** | §6 |
| **Upstream HTTP execution, binding, retry, response limits** | **Us** | Not a protocol concern |
| **Canonical model, readiness, risk, generation** | **Us** | The product |

This table is the practical content of ADR-0004: the adapter's job is to *not* duplicate the left
column.

## 9. Toolchain notes

- `zod@4.4.3` resolves and the SDK depends on `zod ^4.2.0`. No `zod/v4` subpath gymnastics were
  needed when consuming the SDK; the README's `import * as z from 'zod/v4'` applies to authoring Zod
  schemas, which we do not do for tool inputs.
- All three packages are ESM (`"type": "module"`) and ship `.d.mts` / `.d.cts`. Our packages should be
  ESM with `module: nodenext`.
- `@modelcontextprotocol/client` pulls `cross-spawn`, `eventsource`, `eventsource-parser`, `jose`,
  `pkce-challenge` — it is a test/E2E dependency for us, never a runtime dependency of a generated
  server.
### TypeScript version — resolved 2026-08-17 in `P0-W01-T01`

Tested empirically, not assumed:

| Version | `tsc` | `typescript-eslint` 8.67.0 | Verdict |
|---|---|---|---|
| 7.0.2 (latest) | Compiles cleanly | **Hard refusal** — *"typescript-eslint does not support TS 7.0"* | Rejected |
| **6.0.3** | Compiles cleanly | Works | **Pinned** |
| 5.9.3 | Works | Works | Viable fallback |

typescript-eslint tracks TS ≥ 7.1 support in
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940); TS 7
users are directed to run the TS 6 API side-by-side.

**Decision: pin TypeScript 6.0.3.** Lint is a blocking quality gate (TIP §49) and carries two
enforcement mechanisms that nothing else provides — `no-console` in runtime packages (BR-009) and the
`connect()` ban (ADR-0009). Trading a working lint gate for a newer compiler is a bad trade, and TS 6
is one major behind, not five.

**Revisit trigger:** typescript-eslint announces TS ≥ 7.1 support. Re-run
`pnpm run lint && pnpm run typecheck && pnpm run build` after bumping.

## 10. Client API for E2E tests

```js
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'probe-client', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['srv.mjs'] }));

await client.listTools();                                              // { tools: [...] }
await client.callTool({ name: 'get_customer', arguments: { /* ... */ } });
client.getServerCapabilities();                                        // { tools: { listChanged: true } }
await client.close();
```

Note `client.getServerVersion()` returns the **server implementation** identity
(`{name, version}`), not the protocol version. Do not use it to assert protocol era.

## 11. Reproducing these findings

```bash
mkdir probe && cd probe && npm init -y && npm pkg set type=module
npm i @modelcontextprotocol/core@2.0.0 @modelcontextprotocol/server@2.0.0 \
      @modelcontextprotocol/client@2.0.0 zod@^4

# enumerate the real surface
node --input-type=module -e "import * as m from '@modelcontextprotocol/server'; console.log(Object.keys(m).sort().join('\n'))"

# confirm the era on the wire (expects supportedVersions: ["2026-07-28"])
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"raw","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}' | node srv.mjs
```

Re-run this at each phase gate and on every SDK release. Update this file, then the documents that
cite it.
