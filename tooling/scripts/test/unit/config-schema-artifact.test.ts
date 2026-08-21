import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpProjectConfigSchema } from '@mcpgen/config-schema';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const SCHEMA_PATH = fileURLToPath(new URL('../../../../schemas/mcp.config.schema.json', import.meta.url));
const BUILD_SCRIPT = fileURLToPath(new URL('../../build-config-schema.mjs', import.meta.url));

const CONFIGS = [
  'fixtures/openapi-3.1/customer.mcp.config.json',
  'fixtures/openapi-3.1/customer.oauth.mcp.config.json',
  'fixtures/openapi-3.1/customer.mcpaccess.mcp.config.json',
  'fixtures/openapi-3.1/customer.exchange.mcp.config.json',
  'examples/oauth-sandbox/mcp/mcp.config.json',
];

const repoFile = (rel: string) => fileURLToPath(new URL(`../../../../${rel}`, import.meta.url));

describe('schemas/mcp.config.schema.json', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);

  it('is in sync with the zod schemas it is generated from', () => {
    // A hand-maintained copy drifts the first time somebody adds a field, and a config
    // schema that lies is worse than none — it would accept configs the CLI then rejects.
    expect(() => execFileSync(process.execPath, [BUILD_SCRIPT, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it.each(CONFIGS)('accepts %s, which the parser also accepts', (rel) => {
    const config = JSON.parse(readFileSync(repoFile(rel), 'utf8')) as unknown;
    expect(McpProjectConfigSchema.safeParse(config).success).toBe(true);
    expect(validate(config), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('rejects a secret binding carrying a literal value, exactly as the parser does', () => {
    // ADR-0006's central invariant. If the published schema were lax here it would tell
    // an editor that a leaked credential is valid configuration.
    const leaky = JSON.parse(readFileSync(repoFile(CONFIGS[0]!), 'utf8')) as {
      upstreamAuthentication: { token: Record<string, unknown> };
    };
    leaky.upstreamAuthentication.token = { source: 'secret', name: 'API_KEY', value: 'sk-leaked-sentinel' };
    expect(McpProjectConfigSchema.safeParse(leaky).success).toBe(false);
    expect(validate(leaky)).toBe(false);
  });

  it('rejects an unknown top-level key, exactly as the parser does', () => {
    const extra = { ...(JSON.parse(readFileSync(repoFile(CONFIGS[0]!), 'utf8')) as object), nonsense: true };
    expect(McpProjectConfigSchema.safeParse(extra).success).toBe(false);
    expect(validate(extra)).toBe(false);
  });

  it('allows the $schema pointer it is meant to be referenced by', () => {
    const withPointer = {
      ...(JSON.parse(readFileSync(repoFile(CONFIGS[0]!), 'utf8')) as object),
      $schema: '../../schemas/mcp.config.schema.json',
    };
    expect(McpProjectConfigSchema.safeParse(withPointer).success).toBe(true);
    expect(validate(withPointer), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
