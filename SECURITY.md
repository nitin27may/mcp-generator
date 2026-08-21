# Security policy

This project brokers credentials for other people's APIs. A vulnerability here is not
contained to this repository — it reaches whatever the generated server was pointed at. Reports
are taken seriously and answered.

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting** — the *Report a vulnerability* button under
this repository's Security tab. That keeps the report private until a fix exists.

If that is unavailable to you, email **nitin27may@gmail.com** with `SECURITY` in the subject.

**Please do not open a public issue for a suspected vulnerability**, and **never include a real
credential, token, or internal hostname** in a report. A redacted reproduction is always enough;
if it genuinely is not, say so and we will find another way.

Useful to include: what you did, what happened, what you expected, and the smallest spec or
config fragment that reproduces it.

### What to expect

Single maintainer, so these are honest targets rather than a contractual SLA:

| Stage | Target |
|---|---|
| Acknowledgement | 3 days |
| Initial assessment | 7 days |
| Fix for critical/high | 30 days |
| Coordinated disclosure | 90 days, or sooner by agreement |

If a report goes quiet past acknowledgement, please chase it — that is a failure on my side, not
an imposition on yours.

## Supported versions

Pre-1.0. Only `main` is supported; there are no backports. Once releases exist, this table will
say which ones get fixes.

## In scope

Anything that breaks one of the invariants this project is built on:

**Credential exposure.** A secret appearing in a generated package, a config file, a log line, a
trace, an error body, or an MCP tool response. Configuration is supposed to carry only the
*name* of a variable, never a value ([ADR-0006](docs/adr/0006-secrets-are-references-only.md)).

**Authorization-plane confusion.** Anything that lets an inbound MCP access token reach an
upstream API, or lets a token minted for one resource server be accepted by another. The
audience check and the no-passthrough rule are the two invariants most worth attacking
([ADR-0005](docs/adr/0005-separate-auth-planes.md),
[ADR-0010](docs/adr/0010-token-exchange-not-passthrough.md)).

**Governance bypass.** A privileged or destructive operation becoming callable without being
explicitly enabled; retry occurring on a destructive operation; evading risk classification.

**Import-time attacks.** SSRF through spec import or `$ref` resolution — including bypasses of
the IP blocklist, redirect handling, or DNS rebinding.

**Generation-time injection.** Path traversal or zip-slip in generated output; header or URL
injection through a binding; anything that turns a crafted spec into arbitrary writes or
execution.

**MCP transport issues.** DNS rebinding against the HTTP transport, `Origin`/`Host` validation
bypass, or token audience confusion.

**Web wizard escapes.** Path traversal out of a project workspace, or one project reading
another's files.

## Out of scope

Not because they do not matter, but because they are somebody else's to fix:

- **Vulnerabilities in an API you imported.** `mcpgen` describes what your spec declares.
- **Consequences of deliberately enabling a destructive tool.** Enabling `delete_everything`
  and having it delete everything is the feature working.
- **Secrets you placed in your own shell, `.env` file, or CI configuration.**
- **Exposing the web wizard beyond localhost.** It has no accounts, no database and no
  authentication *by design* — verified: there is no `middleware.ts`, no session handling, and
  no auth check on any of its ten API routes. It is a local tool. Running it on a public
  interface is a deployment decision, not a vulnerability.
- **Third-party dependency CVEs** with no demonstrated impact here — report those upstream. A
  CVE plus a working path through this code is very much in scope.
- **The OAuth sandbox's credentials.** Every password and client secret in
  [`examples/oauth-sandbox/`](examples/oauth-sandbox/) is committed in plain text on purpose,
  and the stack is loopback-only with TLS disabled. It exists to be thrown away.

## What already guards these

Context for anyone probing, and the things most worth trying to break:

- **Secrets are references only.** A `secret` binding has no `value` field, and strict
  validation makes a config carrying a literal a hard error rather than something silently
  stripped. `packages/redaction` scrubs known secret values from logs, traces and tool
  responses — including credentials minted at run time, which are not in the binding graph.
- **The auth planes cannot see each other.** `upstream-auth` may not import `mcp-protocol`,
  enforced by [`tooling/scripts/boundaries.mjs`](tooling/scripts/boundaries.mjs) on every push.
  A permanent regression test runs both planes with distinct sentinels and asserts the inbound
  token reaches the upstream nowhere.
- **Safe remote fetch** with an IP blocklist covering loopback, link-local and cloud metadata
  addresses, opt-in only via `MCPGEN_ALLOW_PRIVATE_EGRESS`, which is deliberately not coerced
  from a truthy string — the literal `"false"` does not enable it.
- **A secret-literal scan** over source, fixtures, docs and examples on every push
  ([`tooling/scripts/scan-secrets.mjs`](tooling/scripts/scan-secrets.mjs)).
- **The published CLI cannot fetch remote `$ref`s or read arbitrary files** — the bundler fails
  the build if that code reaches the artifact, even dormant.
- **Project isolation** in the wizard: every project id is validated against a strict UUID
  pattern before any path join, and each project gets its own directory under a workspace root
  with a TTL sweep.

None of that is a claim of completeness. It is a list of what has been thought about, offered so
you can spend your time on what has not.

## Safe harbour

Good-faith research under this policy is welcome, and I will not pursue or support legal action
against anyone following it. Please do not access data that is not yours, degrade a service, or
run tests against anyone else's deployment — the [sandbox](examples/oauth-sandbox/) exists so you
can test against your own.
