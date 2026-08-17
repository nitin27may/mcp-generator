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

---

## 12. `@scalar/openapi-parser` — empirical API notes

| Field | Value |
|---|---|
| Probe date | 2026-08-17 |
| Version | 0.28.14 |
| Method | Installed the package, enumerated exports, ran `validate`/`dereference` against a realistic OAS 3.1 fixture (bearer auth, path+query params, nested `$ref` schema, request body) |

**The fluent `openapi()` builder is deprecated.** Its own type declaration says: *"Creates a fluent
OpenAPI pipeline. @deprecated We are about to drop the pipeline syntax. Use the individual utilities
instead."* Do not build `openapi-adapter` around it — an obvious-looking API that reads well in an
example is not automatically the current one.

**Use `validate()` and `dereference()` directly.**

```ts
declare function validate(value: string | UnknownObject | Filesystem, options?: ValidateOptions): Promise<ValidateResult>;
declare function dereference(value: AnyApiDefinitionFormat | Filesystem, options?: DereferenceOptions): DereferenceResult;
```

- `validate` is **async**; `dereference` is **synchronous** despite the similar shape. Verified by
  calling it without `await` and observing `errors`/`schema` populated immediately.
- `dereference()` resolves every `$ref` **inline**, in place, in the returned `schema`. An
  operation's response schema that pointed at `#/components/schemas/Customer` comes back as the full
  object — confirmed by dereferencing the fixture and inspecting
  `paths['/customers/{customerId}'].get.responses['200'].content['application/json'].schema`, which
  contained the resolved `Customer` object rather than a `$ref`. **Consequence:** `openapi-adapter`
  does not need to implement its own `$ref` walker for P0; every `CanonicalSchemaRef` can be
  `{ kind: 'inline' }`. `reference-resolver` (P1) is about *safe remote fetch* of external refs, not
  re-implementing local resolution the parser already does.
- Result shapes:

  ```ts
  type ValidateResult =
    | { valid: true; specification: StrictOpenApiDocument; version: OpenApiVersion; errors?: ErrorObject[]; schema: StrictOpenApiDocument }
    | { valid: false; specification?: UnknownObject; version?: OpenApiVersion; errors: ErrorObject[]; schema?: UnknownObject };

  type DereferenceResult = { version?: OpenApiVersion; specification?: UnknownObject; schema?: UnknownObject; errors?: ErrorObject[] };
  type ErrorObject = { path?: string[]; message: string; code?: string };
  ```

  Confirmed on an invalid document (missing `paths`): `errors: [{ message: "must have required property 'paths'", path: "" }, ...]` — one entry per missing/invalid top-level requirement, not just the first.
- `version` on a successful validate of an OAS 3.1 document reports `"3.1"` (not `"3.1.0"`, not `"3.1.1"`)  — the major.minor family, not the full `info.version` or the document's declared `openapi` string.

---

## 13. Zod 4.4.3 — a default that would have quietly broken ADR-0006

| Field | Value |
|---|---|
| Probe date | 2026-08-17 |
| Version | 4.4.3 |

**`z.object()`'s default behavior is to silently strip unknown keys, not reject them.** Confirmed:

```ts
const Schema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('secret'), name: z.string().min(1) }),
  // ...
]);
Schema.safeParse({ source: 'secret', name: 'X', value: 'leak' }).success; // => true
```

The extra `value` key parses away silently. If `SecretBinding` had been validated with a plain
`z.object()`, a config with a leaked literal on a secret binding would **pass validation** — the
`value` field would vanish from the parsed result with no error, hiding the exact mistake ADR-0006
exists to catch, from the person who made it.

**Fix: every `config-schema` object schema uses `.strict()`.** Confirmed it rejects rather than
strips:

```ts
z.object({ source: z.literal('secret'), name: z.string().min(1) }).strict()
  .safeParse({ source: 'secret', name: 'X', value: 'leak' });
// => { success: false, error: { issues: [{ code: 'unrecognized_keys', keys: ['value'], ... }] } }
```

This is now a house rule for the package, not a one-off: an unknown key anywhere in `mcp.config.json`
must be a validation error, never a silent drop — the same principle applies beyond secrets (a typo'd
field name should fail loudly, not disappear).

---

## 14. `serveStdio`'s default silently accommodates the legacy era too

| Field | Value |
|---|---|
| Probe date | 2026-08-17 |
| Source | `@modelcontextprotocol/server@2.0.0` `dist/stdio.d.mts`, read directly (not the README) |

`serveStdio` is **synchronous** — `declare function serveStdio(factory, options?): StdioServerHandle`,
not a Promise. The returned handle has one lifecycle method: `close(): Promise<void>`.

**The default behavior is not "modern only."** `ServeStdioOptions.legacy` defaults to `'serve'`:

> *"`'serve'` (default) — the connection is pinned to a 2025-era instance from the same factory and
> served exactly as a hand-wired stdio server serves it today."*
> *"`'reject'` — the opening request is answered with the unsupported-protocol-version error naming
> the supported modern revisions."*

So out of the box, `serveStdio(factory)` auto-detects the client's opening message and serves
**whichever era the client speaks** — legacy `initialize` included. TIP §27 sets
`legacyMode: "disabled"` for MVP; the SDK does not enforce that by default, we do, by passing
`{ legacy: 'reject' }` explicitly. Omitting this option would silently contradict our own documented
policy — the server would work fine, just not the way ADR-0009 says it does.

`onerror` is available for out-of-band transport errors (reporting only — never alters wire output),
useful for wiring into `RuntimeLogger`. `transport` allows injecting a custom `Transport` (e.g. a
Unix socket) instead of real process stdio, not needed for P0's E2E, which spawns a real child
process to exercise the real thing.

---

## 15. The high-level `Client` also defaults to the legacy era — symmetric opt-in

| Field | Value |
|---|---|
| Probe date | 2026-08-17 |
| Source | `@modelcontextprotocol/client@2.0.0` `dist/index.d.mts`, and a real failure it produced |

Building `mcp-protocol`'s tests, a `Client` connected to a `serveStdio({ legacy: 'reject' })` server
via `InMemoryTransport.createLinkedPair()` failed immediately:

```
ProtocolError: Unsupported protocol version: 2025-11-25
```

**The client opened with a legacy `initialize` by default — it did not probe with `server/discover`
first.** `ClientOptions.versionNegotiation` is a **constructor** option (`new Client(info, options)`,
not `connect(transport, options)`), and its documented default is `'legacy'`:

> *"The default is `'legacy'`: absent (or `mode: 'legacy'`), `connect()` runs the plain 2025 sequence,
> byte-identical to today's behavior (no probe, no new headers). Opt into `'auto'` or pin to talk to
> a 2026-07-28 server."*

Two opt-in modes:

- `mode: 'auto'` — probes with `server/discover` first; falls back to legacy `initialize` on any
  unrecognized or legacy signal (including a probe timeout on stdio, since some legacy servers never
  answer an unknown pre-`initialize` method).
- `mode: { pin: '2026-07-28' }` — modern era at exactly that revision, no probe, no fallback; a
  mismatch fails loudly rather than silently negotiating down.

**Consequence: neither side of an MCP connection is modern by default.** The server needs
`legacy: 'reject'` (§14) and the client needs `versionNegotiation` set, or the pair silently
negotiates down to 2025-11-25 — which is exactly the failure mode risk R21 exists to catch, just on
the client side instead of the server side. `mcp-protocol`'s tests now construct clients via a
`modernClient()` helper pinning `{ mode: { pin: '2026-07-28' } }`, so a version mismatch is a loud
test failure rather than a silent legacy fallback.

**This is not just a testing concern.** The generated CLI, the future `test-fixtures` E2E harness
(`P0-W25-T02`), and any real MCP client integrating a generated server all need this same opt-in on
whichever side they own. Worth a line in the generated README (TIP §73/§74): a client connecting
with default settings will speak legacy `initialize` and get rejected by a `legacy: 'reject'` server —
that is correct behavior, not a bug, but it will look like one to an integrator who hasn't read this.
