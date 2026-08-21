import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { startFixtureApi, type FixtureApiHandle } from '@mcpgen/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { performExecute } from '../../src/server/execute.js';
import { seedProjectConfig } from '@mcpgen/config-seed';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

let api: FixtureApiHandle | undefined;

afterEach(async () => {
  await api?.stop();
  api = undefined;
});

async function configFor(baseUrl: string) {
  const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
  const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
  if (!parsed.value) throw new Error('fixture spec failed to parse');
  const canonicalApi = parsed.value;
  const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));
  const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
  const operation = canonicalApi.operations.find((op) => op.operationId === 'getCustomer')!;
  const config = {
    ...baseConfig,
    api: { baseUrl: { source: 'static' as const, value: baseUrl } },
    tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true } },
  };
  const bearerToken = config.upstreamAuthentication?.type === 'bearer' ? config.upstreamAuthentication.token : undefined;
  const tokenBindingName = bearerToken?.source === 'secret' ? bearerToken.name : undefined;
  if (!tokenBindingName) throw new Error('expected the seeded auth to be bearer');
  // A real (if fake) secret value — otherwise `buildExecute` fails at auth resolution before ever
  // attempting the network call, which would make these tests pass for the wrong reason entirely.
  return { config, operationsById, toolName: config.tools[operation.id]!.name, secrets: { [tokenBindingName]: 'dummy-token-for-ssrf-test' } };
}

/**
 * The live-execute route's one genuine attack surface: a user-controlled
 * `api.baseUrl` (or a redirect from an otherwise-legitimate one) reaching a
 * private/link-local/metadata address. `createSafeFetch` does the real
 * blocking (already unit-tested in `openapi-adapter`); these tests prove
 * `performExecute` actually wires it in for the live-execute path
 * specifically, with the default (`MCPGEN_ALLOW_PRIVATE_EGRESS` off).
 */
describe('performExecute — SSRF defense on live execution', () => {
  it('blocks a cloud metadata address (169.254.169.254)', async () => {
    const { config, operationsById, toolName, secrets } = await configFor('https://169.254.169.254');
    const outcome = await performExecute(config, operationsById, toolName, { customer_id: 'x' }, {}, secrets, false, false);
    expect(outcome).toMatchObject({ ok: false, kind: 'egress-blocked' });
  });

  it('blocks a private RFC 1918 address (10.0.0.1)', async () => {
    const { config, operationsById, toolName, secrets } = await configFor('https://10.0.0.1');
    const outcome = await performExecute(config, operationsById, toolName, { customer_id: 'x' }, {}, secrets, false, false);
    expect(outcome).toMatchObject({ ok: false, kind: 'egress-blocked' });
  });

  it('blocks loopback (127.0.0.1) even though the fixture API itself runs there', async () => {
    api = await startFixtureApi({ expectedToken: 'sk-irrelevant-sentinel' });
    const loopbackUrl = api.baseUrl.replace('localhost', '127.0.0.1');
    const { config, operationsById, toolName, secrets } = await configFor(loopbackUrl);

    const outcome = await performExecute(config, operationsById, toolName, { customer_id: 'x' }, {}, secrets, false, false);
    expect(outcome).toMatchObject({ ok: false, kind: 'egress-blocked' });
  });

  it('allows loopback when allowPrivateEgress is explicitly true — the real fixture API actually responds', async () => {
    api = await startFixtureApi({ expectedToken: 'sk-dev-token-sentinel' });
    const { config, operationsById, toolName } = await configFor(api.baseUrl);
    const bearerToken = config.upstreamAuthentication?.type === 'bearer' ? config.upstreamAuthentication.token : undefined;
    const tokenBindingName = bearerToken?.source === 'secret' ? bearerToken.name : undefined;
    if (!tokenBindingName) throw new Error('expected bearer auth');

    const outcome = await performExecute(config, operationsById, toolName, { customer_id: 'c-42' }, {}, { [tokenBindingName]: 'sk-dev-token-sentinel' }, false, true);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.trace.upstreamStatus).toBe(200);
  });

  it('never leaks the bearer token literal anywhere in the blocked-egress outcome', async () => {
    const { config, operationsById, toolName, secrets } = await configFor('https://169.254.169.254');
    const outcome = await performExecute(config, operationsById, toolName, { customer_id: 'x' }, {}, { ...secrets, SOME_SECRET: 'sk-should-never-appear' }, false, false);
    expect(JSON.stringify(outcome)).not.toContain('sk-should-never-appear');
  });
});
