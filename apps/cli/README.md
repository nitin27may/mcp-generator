# mcpgen

The `mcpgen` CLI: turn an OpenAPI/Swagger document into a governed, portable [MCP](https://modelcontextprotocol.io) server — no JSON hand-authoring, no clone required.

> Import OpenAPI. Configure once. Run MCP anywhere.

This is the npm package page. For the full project — the web wizard, architecture, and source — see [github.com/nitin27may/mcp-generator](https://github.com/nitin27may/mcp-generator).

## Install

```bash
npm install -g @nitin27may/mcpgen
```

Requires Node.js ≥ 22.11.

## Quickstart

```bash
mcpgen init     --spec ./openapi.json --enable-read-only
mcpgen validate --config ./mcp.config.json --spec ./openapi.json
mcpgen generate --config ./mcp.config.json --spec ./openapi.json --out ./my-mcp-server
```

`init` derives a complete `mcp.config.json` from your spec — environment variable names, an auth
block seeded from the spec's own security scheme where one can be, every operation as a disabled
tool. Nothing is auto-enabled beyond what `--enable-read-only`/`--enable <name>` asks for
(destructive and privileged operations are never turned on for you). `validate` checks the config
against the current environment — a real deploy-time secret needs to be set for it to pass.
`generate` produces a redistributable server package: `cd my-mcp-server && npm install && node
dist/cli.mjs serve`.

## Commands

| Command | Purpose |
|---|---|
| `init` | Derive a draft `mcp.config.json` from an OpenAPI/Swagger document |
| `validate` | Check a config against its spec and the current environment |
| `generate` | Build a redistributable MCP server package |
| `serve` | Start an MCP server directly from a config, without generating a package |
| `print-tools` | Print the tool surface as JSON |
| `print-config` | Print the normalized config as JSON |

Run `mcpgen --help` or `mcpgen help <command>` for the full flag reference of any command.
Run `mcpgen --version` to print the installed version.

### `init` flags

| Flag | Default | Purpose |
|---|---|---|
| `--spec <path>` | `./openapi.json` | The OpenAPI/Swagger document |
| `--out <path>` | `./mcp.config.json` | Where to write the config |
| `--name <name>` | the document's title | Project name |
| `--package-name <npm-name>` | derived from the name | Generated package name |
| `--bin-name <name>` | derived from the name | Generated binary name |
| `--transport stdio\|http` | `stdio` | Transport the generated server will support |
| `--enable-read-only` | off | Enable every operation classified `READ_ONLY` |
| `--enable <tool-name>` | — | Enable one tool by its exact generated name (repeatable, no globs) |
| `--force` | off | Overwrite an existing file at `--out` |
| `--json` | off | Print the summary as JSON instead of human-readable text |

### `serve`/`validate` flags

| Flag | Default | Purpose |
|---|---|---|
| `--config <path>` | `./mcp.config.json` | The project config |
| `--spec <path>` | `./openapi.json` | The OpenAPI/Swagger document |
| `--transport stdio\|http` | `stdio` | (`serve` only) |
| `--host <host>` / `--port <port>` | — | (`serve --transport http` only; `--port 0` picks any available port) |
| `--dotenv <path>` | — | Load environment variables from a file before resolving bindings (repeatable). A real environment variable already set always wins over one loaded this way — safe to leave in a launch command an MCP client controls. |

## Authentication: env vars, resolved at run time

`init` derives environment variable names from the spec's own security scheme:

| Scheme | Env vars `init` derives | Which are secrets |
|---|---|---|
| API key | `<SLUG>_API_KEY` | the key itself |
| Bearer token | `<SLUG>_TOKEN` | the token |
| Basic auth | `<SLUG>_USERNAME`, `<SLUG>_PASSWORD` | password only |
| OAuth2 client credentials | `<SLUG>_CLIENT_ID`, `<SLUG>_CLIENT_SECRET` | client secret only |

None of these are ever written into `mcp.config.json` as a literal value — the config carries only
the variable *name*. The credential itself is supplied however you launch the server: export it in
your shell, pass `--dotenv <file>`, or — the normal case once you've registered the server with an
MCP client — let the client inject it via that client's own launch config. You never type a
credential while curating the tool surface, only when you actually run the server.

## Using the generated server with an MCP client

Every package `mcpgen generate` produces ships its own `README.md` with a client-configuration JSON
snippet for the credentials and command your specific config needs — open it after generating.

## Exit codes

**0** success · **1** the operation ran but failed (a diagnostic was emitted — a missing secret, a
validation error) · **2** a usage error (an unknown command or flag, an invalid flag value) —
nothing was even attempted.

## License

MIT — see [LICENSE](https://github.com/nitin27may/mcp-generator/blob/main/LICENSE).
