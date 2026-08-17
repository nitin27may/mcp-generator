import { describe, expect, it } from 'vitest';
import { buildEnvExample } from './env-example.js';
import { config, tool } from './test-helpers.js';

describe('buildEnvExample', () => {
  it('lists the base URL and secret from the P0-shaped config', () => {
    const out = buildEnvExample(config());
    expect(out).toContain('CUSTOMER_API_URL=');
    expect(out).toContain('CUSTOMER_API_KEY=');
  });

  it('never includes a real value — FR-SEC-002', () => {
    const out = buildEnvExample(config());
    expect(out).not.toMatch(/CUSTOMER_API_KEY=\S/);
  });

  it('separates non-sensitive and secret variables into distinct sections', () => {
    const out = buildEnvExample(config());
    const secretsHeaderIndex = out.indexOf('# Secrets');
    const keyIndex = out.indexOf('CUSTOMER_API_KEY=');
    const urlIndex = out.indexOf('CUSTOMER_API_URL=');
    expect(urlIndex).toBeLessThan(secretsHeaderIndex);
    expect(keyIndex).toBeGreaterThan(secretsHeaderIndex);
  });

  it('collects environment bindings from tool-level bindings too, not just base URL and auth', () => {
    const withToolEnv = config({
      tools: {
        get_customer: tool({ bindings: { customerId: { source: 'tool-input', inputName: 'customer_id' }, apiVersion: { source: 'environment', name: 'API_VERSION', required: false } } }),
      },
    });
    expect(buildEnvExample(withToolEnv)).toContain('API_VERSION=');
  });

  it('does not duplicate a variable referenced by more than one binding', () => {
    const out = buildEnvExample(config());
    const occurrences = out.split('CUSTOMER_API_URL=').length - 1;
    expect(occurrences).toBe(1);
  });

  it('produces no secret section when there is no upstream auth at all', () => {
    const noAuth = config();
    const out = buildEnvExample({
      schemaVersion: noAuth.schemaVersion,
      project: noAuth.project,
      api: noAuth.api,
      tools: noAuth.tools,
      generation: noAuth.generation,
    });
    expect(out).not.toContain('# Secrets');
  });
});
