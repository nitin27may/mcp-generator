# CLI reference

`mcpgen` has six commands. This is the complete surface; run `mcpgen help <command>` for the
same flag list from the binary itself.

```
mcpgen <command> [flags]
```

| Command | What it does |
|---|---|
| [`init`](#init) | Derive a draft `mcp.config.json` from a spec |
| [`validate`](#validate) | Check a config against its spec and the current environment |
| [`serve`](#serve) | Run an MCP server for a config |
| [`generate`](#generate) | Build a redistributable MCP server package |
| [`print-tools`](#print-tools) | Print the tool surface as JSON |
| [`print-config`](#print-config) | Print the normalized config as JSON |

Global forms: `--help` / `-h`, `--version` / `-v`, and `mcpgen help <command>`. `--help`
anywhere in the arguments short-circuits before any other validation, so it works even when
the rest of the invocation is wrong.

> **`mcpgen` with no arguments runs `serve`.** This exists because MCP clients launch the
> binary bare, with configuration supplied through the environment. It is worth knowing
> before you type `mcpgen` at a prompt expecting usage text.

## Exit codes

Consistent across every command:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The operation ran and failed — diagnostics were emitted |
| `2` | A usage error — nothing was attempted |

Diagnostics always go to **stderr**. `stdout` carries JSON output (`print-tools`,
`print-config`, `init --json`) or the JSON-RPC protocol stream, and nothing else.

---

## `init`

Derives a complete draft config from a spec. Non-interactive by design: no prompts, no TTY
requirement, safe in CI.

```bash
mcpgen init --spec ./openapi.json --enable-read-only
```

| Flag | Default | Notes |
|---|---|---|
| `--spec <path>` | `./openapi.json` | The OpenAPI/Swagger document |
| `--out <path>` | `./mcp.config.json` | Where to write the config |
| `--name <name>` | the document's title | Project name |
| `--package-name <npm-name>` | derived from the name | Generated package name |
| `--bin-name <name>` | derived from the name | Generated binary name |
| `--transport <stdio\|http>` | `stdio` | Transport the generated server supports |
| `--enable-read-only` | off | Enable every operation classified `READ_ONLY` |
| `--enable <tool-name>` | — | Enable one tool by exact name. Repeatable. **No globs.** |
| `--force` | off | Overwrite an existing `--out` |
| `--json` | off | Emit the summary as JSON |

**What it does and does not do.** It derives env var names, an auth block seeded from the
spec's own security scheme where one can be, and every operation as a *disabled* tool. It
then re-parses what it wrote before persisting — it must never write something it would not
itself accept back.

Nothing is enabled beyond what you ask for, and **destructive operations are never enabled
at all**, including by `--enable-read-only`. To enable one you must name it explicitly, which
is the point (BR-006, [ADR-0008](adr/0008-destructive-retry-disabled-by-default.md)).

`--enable` takes exact names and rejects globs deliberately: a pattern that silently matches
one more operation than you intended is exactly the mistake this tool exists to prevent.

Auth seeding is narrower than people expect. Only `clientCredentials` is derivable from an
OpenAPI security scheme; an `authorizationCode` flow produces a warning and no auth block,
because the delegated case is RFC 8693 token exchange and no security scheme can describe it
([ADR-0010](adr/0010-token-exchange-not-passthrough.md)).

Exit `1` if `--out` exists without `--force`, if the spec cannot be read, or if the derived
config fails its own validation. Exit `2` for an invalid `--package-name` or `--bin-name`.

## `validate`

Checks a config against its spec **and the current environment**, without starting anything.

```bash
mcpgen validate --config mcp.config.json --spec openapi.json --dotenv ./local.env
```

| Flag | Default |
|---|---|
| `--config <path>` | `./mcp.config.json` |
| `--spec <path>` | `./openapi.json` |
| `--dotenv <path>` | — (repeatable) |

Exit `1` if any error diagnostic is emitted.

On a fresh clone with no deployment variables set this reports `BND-005` and `AUT-001` — an
unresolved base URL and a missing credential. **That is the expected result**, and catching
exactly that before `serve` starts is what the command is for. See
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md#startup-and-credentials--aut--bnd-005-sec-).

## `serve`

Runs an MCP server for a config.

```bash
mcpgen serve                                        # stdio, the normal case
mcpgen serve --transport http --port 8080           # Streamable HTTP
```

| Flag | Default | Notes |
|---|---|---|
| `--config <path>` | `./mcp.config.json` | |
| `--spec <path>` | `./openapi.json` | |
| `--transport <stdio\|http>` | `stdio` | |
| `--host <host>` | `127.0.0.1` | `http` only |
| `--port <port>` | — | `http` only. `0` picks any available port |
| `--dotenv <path>` | — | Repeatable |

Every failure path returns **before** either transport starts. That includes Plane A: the
authorization gate is constructed before the port opens, because a server that is listening
but accepting everything is worse than one that failed to start.

The startup log line reports `"authorization":"oauth2"` or `"none"`. If you configured
`mcpAccess` and see `"none"`, it did not resolve and the endpoint is open.

Shuts down cleanly on `SIGINT`, `SIGTERM`, or stdin EOF — the last being how an MCP client
signals a stdio server to stop.

### On `--dotenv`

Not `--env-file`, deliberately: Node intercepts that as a runtime flag even after the script
path, so it would never reach the CLI.

A real environment variable **always wins** over one loaded from a file. `process.loadEnvFile()`
was rejected for the opposite behaviour. This matters because an MCP client injects
configuration through its own `env` block, and a stale local file silently overriding it would
be very hard to diagnose.

## `generate`

Builds a redistributable MCP server package.

```bash
mcpgen generate --config mcp.config.json --spec openapi.json --out ./dist-mcp
```

| Flag | Default |
|---|---|
| `--config <path>` | `./mcp.config.json` |
| `--spec <path>` | `./openapi.json` |
| `--out <dir>` | `./dist-mcp` |

The output ships its own `README.md` covering required environment variables, `npx` setup, an
MCP client-configuration snippet, Docker instructions and troubleshooting. You do not need
this repository's documentation to run what it produces — read the generated package's README
first.

## `print-tools`

Prints the tool surface as JSON to stdout: what an MCP client would see from `tools/list`,
without starting a server.

| Flag | Default |
|---|---|
| `--config <path>` | `./mcp.config.json` |
| `--spec <path>` | `./openapi.json` |

Useful for diffing a tool surface in review — the question "what did this config change let
an agent do?" is answerable by diffing two runs of this.

## `print-config`

Prints the normalized config as JSON. The only command that does not take `--spec`.

| Flag | Default |
|---|---|
| `--config <path>` | `./mcp.config.json` |

## Registering with an MCP client

Once `validate` is clean:

```json
{
  "mcpServers": {
    "orders": {
      "command": "npx",
      "args": ["-y", "@nitin27may/mcpgen", "serve",
               "--config", "/abs/path/mcp.config.json",
               "--spec", "/abs/path/openapi.json"],
      "env": { "ORDERS_API_URL": "https://api.example.com", "ORDERS_API_KEY": "..." }
    }
  }
}
```

The `env` block is the normal way credentials reach the server. They are never written into
`mcp.config.json` — it carries only the *name* of each variable
([ADR-0006](adr/0006-secrets-are-references-only.md)).

## See also

- [`CONFIG.md`](CONFIG.md) — every field of the file these commands read and write
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — what each diagnostic code means
- [`OAUTH.md`](OAUTH.md) — configuring either authentication plane
