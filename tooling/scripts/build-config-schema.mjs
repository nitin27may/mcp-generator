#!/usr/bin/env node
/**
 * Emits `mcp.config.schema.json` from the zod schemas in `@mcpgen/config-schema`.
 *
 * The README calls `mcp.config.json` "the durable artifact, not generated source — the
 * product". It is also the thing users are told to commit to their own repository, and
 * until now there was no schema for it anywhere: no editor completion, no `$schema`
 * validation, no way to check a hand-edited config without running the CLI.
 *
 * Derived rather than hand-written, deliberately. A hand-maintained copy of a schema that
 * already exists in code drifts the first time somebody adds a field, and a config schema
 * that lies is worse than none — it would validate configs the CLI then rejects.
 *
 * `--check` verifies the committed file matches what the code would emit, so drift fails
 * CI instead of being discovered by a user.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpProjectConfigSchema } from '@mcpgen/config-schema';

const OUTPUT = fileURLToPath(new URL('../../schemas/mcp.config.schema.json', import.meta.url));
const ID = 'https://raw.githubusercontent.com/nitin27may/mcp-generator/main/schemas/mcp.config.schema.json';

const generated = z.toJSONSchema(McpProjectConfigSchema, {
  target: 'draft-2020-12',
  // `.strict()` is load-bearing here (ADR-0006): a SecretBinding carrying a literal
  // `value` must fail, not be silently stripped. `io: 'input'` keeps that faithful.
  io: 'input',
  unrepresentable: 'any',
});

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: ID,
  title: 'mcpgen project configuration',
  description:
    'The portable MCP definition produced by `mcpgen init` and the web wizard, and read by ' +
    '`mcpgen serve`/`generate`. Commit this file; it is the source of truth for a generated ' +
    'server, and it never contains a credential — only the name of the variable one is read from.',
  ...generated,
};

const serialized = JSON.stringify(schema, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let current;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    console.error(`::error::${OUTPUT} is missing. Run: node tooling/scripts/build-config-schema.mjs`);
    process.exit(1);
  }
  if (current !== serialized) {
    console.error('::error::schemas/mcp.config.schema.json is out of date with packages/config-schema.');
    console.error('Regenerate it: node tooling/scripts/build-config-schema.mjs');
    process.exit(1);
  }
  console.log('config schema: up to date');
  process.exit(0);
}

writeFileSync(OUTPUT, serialized);
console.log(`config schema: wrote ${OUTPUT}`);
