import { createHash } from 'node:crypto';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation } from '@mcpgen/domain';

/** Deterministic content hash — duplicated in miniature from openapi-adapter's fingerprint.ts rather than adding a cross-package dependency for 10 lines. */
function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

/** TIP §39 — artifact reproducibility manifest, extended with the baked operations the runtime needs (no OpenAPI re-parsing at generated-package runtime). */
export interface GenerationManifest {
  readonly generatorVersion: string;
  readonly configSchemaVersion: string;
  readonly mcpProtocolTarget: string;
  readonly sourceFingerprint?: string;
  readonly configFingerprint: string;
  readonly generatedAt: string;
  readonly operations: readonly CanonicalOperation[];
}

const GENERATOR_VERSION = '0.1.0';
const MCP_PROTOCOL_TARGET = '2026-07-28'; // ADR-0009

export function buildGenerationManifest(
  config: McpProjectConfig,
  operations: readonly CanonicalOperation[],
  options: { sourceFingerprint?: string; generatedAt?: string } = {},
): GenerationManifest {
  return {
    generatorVersion: GENERATOR_VERSION,
    configSchemaVersion: config.schemaVersion,
    mcpProtocolTarget: MCP_PROTOCOL_TARGET,
    ...(options.sourceFingerprint !== undefined ? { sourceFingerprint: options.sourceFingerprint } : {}),
    configFingerprint: fingerprintOf(config),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    operations,
  };
}
