import { describe, expect, it } from 'vitest';
import { collectInitWarnings, renderInitJson, renderInitSummary, suggestionFor, type InitSummary } from './init-summary.js';

function summary(overrides: Partial<InitSummary> = {}): InitSummary {
  return {
    outPath: './mcp.config.json',
    projectName: 'Customer API',
    slug: 'customer-api',
    specPath: './openapi.json',
    declaredVersion: 'OpenAPI/Swagger, 1.0.0',
    operationCount: 3,
    auth: { kind: 'seeded', type: 'bearer', schemeName: 'bearerAuth' },
    skippedSchemes: [],
    toolsDiscovered: 3,
    toolsEnabled: 2,
    toolsByRisk: { READ_ONLY: 2, WRITE: 0, DESTRUCTIVE: 0, PRIVILEGED: 0, UNKNOWN: 0 },
    unmatchedEnableNames: [],
    envVars: [
      { name: 'CUSTOMER_API_BASE_URL', sensitive: false, required: true, usedByToolCount: 0, usedByBaseUrl: true, usedByAuth: false, usedByMcpAccess: false },
      { name: 'CUSTOMER_API_TOKEN', sensitive: true, required: true, usedByToolCount: 0, usedByBaseUrl: false, usedByAuth: true, usedByMcpAccess: false },
    ],
    ...overrides,
  };
}

describe('renderInitSummary', () => {
  it('names the output path, project, source, auth type, and tool counts', () => {
    const text = renderInitSummary(summary());
    expect(text).toContain('Wrote ./mcp.config.json');
    expect(text).toContain('Customer API');
    expect(text).toContain('bearer');
    expect(text).toContain('3 discovered · 2 enabled');
  });

  it('lists every env var this config requires', () => {
    const text = renderInitSummary(summary());
    expect(text).toContain('CUSTOMER_API_BASE_URL');
    expect(text).toContain('CUSTOMER_API_TOKEN');
  });

  it('suggests --enable-read-only next only when nothing is enabled', () => {
    expect(renderInitSummary(summary({ toolsEnabled: 0 }))).toContain('--enable-read-only --force');
    expect(renderInitSummary(summary({ toolsEnabled: 2 }))).not.toContain('--enable-read-only --force');
  });

  it('reports no auth block written when the scheme was unsupported', () => {
    const text = renderInitSummary(
      summary({ auth: { kind: 'unsupported', schemeName: 'oauth2Auth', reason: 'oauth2-flow-unsupported', suggestion: 'x' } }),
    );
    expect(text).toContain('none written');
    expect(text).toContain('oauth2Auth');
  });

  it('reports no security scheme declared, distinctly from an unsupported one', () => {
    expect(renderInitSummary(summary({ auth: { kind: 'none' } }))).toContain('none — the document declares no security scheme');
  });
});

describe('collectInitWarnings', () => {
  it('warns when auth was unsupported, naming the scheme and the suggestion', () => {
    const warnings = collectInitWarnings(
      summary({ auth: { kind: 'unsupported', schemeName: 'oauth2Auth', reason: 'oauth2-flow-unsupported', suggestion: suggestionFor('oauth2-flow-unsupported') } }),
    );
    expect(warnings.map((w) => w.message).join(' ')).toContain('oauth2Auth');
  });

  it('does not warn about auth when it was seeded or absent', () => {
    expect(collectInitWarnings(summary()).some((w) => w.message.includes('scheme'))).toBe(false);
    expect(collectInitWarnings(summary({ auth: { kind: 'none' } })).some((w) => w.message.includes('scheme'))).toBe(false);
  });

  it('warns about --enable names that matched nothing', () => {
    const warnings = collectInitWarnings(summary({ unmatchedEnableNames: ['getCustmoer'] }));
    expect(warnings.some((w) => w.message.includes('getCustmoer'))).toBe(true);
  });

  it('warns when zero tools are enabled, and not otherwise', () => {
    expect(collectInitWarnings(summary({ toolsEnabled: 0 })).some((w) => w.message.includes('empty tool surface'))).toBe(true);
    expect(collectInitWarnings(summary({ toolsEnabled: 2 })).some((w) => w.message.includes('empty tool surface'))).toBe(false);
  });

  it('warns about skipped schemes when more than one was declared', () => {
    const warnings = collectInitWarnings(summary({ skippedSchemes: [{ name: 'apiKeyAuth', reason: 'x' }] }));
    expect(warnings.some((w) => w.message.includes('apiKeyAuth'))).toBe(true);
  });
});

describe('renderInitJson', () => {
  it('produces parseable JSON carrying the summary and warning messages', () => {
    const text = renderInitJson(summary({ toolsEnabled: 0 }), collectInitWarnings(summary({ toolsEnabled: 0 })));
    const parsed = JSON.parse(text);
    expect(parsed.projectName).toBe('Customer API');
    expect(parsed.warnings.some((w: string) => w.includes('empty tool surface'))).toBe(true);
  });
});
