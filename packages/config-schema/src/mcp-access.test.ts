import { describe, expect, it } from 'vitest';
import { McpAccessSchema } from './mcp-access.js';

const issuer = { source: 'static', value: 'https://idp.example.com' } as const;
const resource = { source: 'static', value: 'https://mcp.example.com/mcp' } as const;

describe('McpAccessSchema — Plane A, ADR-0005', () => {
  it('accepts the explicit opt-out', () => {
    expect(McpAccessSchema.safeParse({ mode: 'none' }).success).toBe(true);
  });

  it('accepts a minimal oauth2 block', () => {
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', issuer, resource }).success).toBe(true);
  });

  it('accepts environment-bound issuer and resource', () => {
    // The normal deployment shape: both URLs differ per environment, exactly like api.baseUrl.
    expect(
      McpAccessSchema.safeParse({
        mode: 'oauth2',
        issuer: { source: 'environment', name: 'MCP_ISSUER_URL', required: true },
        resource: { source: 'environment', name: 'MCP_PUBLIC_URL', required: true },
      }).success,
    ).toBe(true);
  });

  it('accepts optional jwksUri, requiredScopes and the insecure-issuer escape hatch', () => {
    expect(
      McpAccessSchema.safeParse({
        mode: 'oauth2',
        issuer,
        resource,
        jwksUri: { source: 'static', value: 'https://idp.example.com/jwks' },
        requiredScopes: ['mcp:tools'],
        dangerouslyAllowInsecureIssuer: true,
      }).success,
    ).toBe(true);
  });

  it('requires a resource — the audience check has nothing to compare against without it', () => {
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', issuer }).success).toBe(false);
  });

  it('requires an issuer', () => {
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', resource }).success).toBe(false);
  });

  it('rejects an unknown mode', () => {
    expect(McpAccessSchema.safeParse({ mode: 'mtls', issuer, resource }).success).toBe(false);
  });

  it('rejects unknown keys rather than silently dropping them', () => {
    // .strict() throughout: a misspelled `requiredScope` must not validate as "no scopes required".
    expect(
      McpAccessSchema.safeParse({ mode: 'oauth2', issuer, resource, requiredScope: ['mcp:tools'] }).success,
    ).toBe(false);
  });

  it('rejects a secret-bound issuer — an issuer URL is not a credential', () => {
    expect(
      McpAccessSchema.safeParse({ mode: 'oauth2', issuer: { source: 'secret', name: 'ISSUER' }, resource }).success,
    ).toBe(false);
  });

  it('rejects a tool-input-bound resource — it is deployment-fixed, never per-call', () => {
    expect(
      McpAccessSchema.safeParse({
        mode: 'oauth2',
        issuer,
        resource: { source: 'tool-input', inputName: 'resource' },
      }).success,
    ).toBe(false);
  });

  it('accepts an opaque audience distinct from the resource URL', () => {
    // Keycloak mints a client id, Entra ID mints api://<guid>. The resource still has to be
    // a URL because RFC 9728 discovery is derived from it, so the two are separate fields.
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', issuer, resource, audience: 'mcp-server' }).success).toBe(true);
  });

  it('rejects an empty audience', () => {
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', issuer, resource, audience: '' }).success).toBe(false);
  });

  it('rejects an empty scope string', () => {
    expect(McpAccessSchema.safeParse({ mode: 'oauth2', issuer, resource, requiredScopes: [''] }).success).toBe(false);
  });

  it('rejects extra keys on the none mode', () => {
    expect(McpAccessSchema.safeParse({ mode: 'none', issuer }).success).toBe(false);
  });
});
