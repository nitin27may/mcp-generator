import { describe, expect, it } from 'vitest';
import { buildGenerationManifest } from './manifest.js';
import { config, operation } from './test-helpers.js';

describe('buildGenerationManifest', () => {
  it('records the ADR-0009 protocol target', () => {
    const manifest = buildGenerationManifest(config(), [operation()]);
    expect(manifest.mcpProtocolTarget).toBe('2026-07-28');
  });

  it('carries the config schema version through', () => {
    const manifest = buildGenerationManifest(config(), [operation()]);
    expect(manifest.configSchemaVersion).toBe('1.0');
  });

  it('embeds the referenced operations verbatim', () => {
    const op = operation();
    const manifest = buildGenerationManifest(config(), [op]);
    expect(manifest.operations).toEqual([op]);
  });

  it('computes a stable config fingerprint regardless of key order', () => {
    const a = buildGenerationManifest(config(), []);
    const b = buildGenerationManifest(JSON.parse(JSON.stringify(config())), []);
    expect(a.configFingerprint).toBe(b.configFingerprint);
  });

  it('produces a different fingerprint when the config actually differs', () => {
    const a = buildGenerationManifest(config(), []);
    const b = buildGenerationManifest(config({ project: { name: 'different' } }), []);
    expect(a.configFingerprint).not.toBe(b.configFingerprint);
  });

  it('includes sourceFingerprint only when explicitly provided', () => {
    const withSource = buildGenerationManifest(config(), [], { sourceFingerprint: 'abc123' });
    const withoutSource = buildGenerationManifest(config(), []);
    expect(withSource.sourceFingerprint).toBe('abc123');
    expect(withoutSource).not.toHaveProperty('sourceFingerprint');
  });

  it('accepts an explicit generatedAt for deterministic testing', () => {
    const manifest = buildGenerationManifest(config(), [], { generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(manifest.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
