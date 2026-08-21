import { createMcpAccessGate, type McpAccessGate } from '@mcpgen/mcp-protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureIdp, type FixtureIdpHandle } from '../../src/index.js';

/**
 * Plane A rejection paths (ADR-0005, FR-AUTH-MCP-002/004, R11).
 *
 * The happy path is the least interesting thing here. A gate that accepts a good token
 * but also accepts a token minted for somebody else is worse than no gate at all, because
 * it looks like protection. Every case below is a token that MUST be refused.
 */

const RESOURCE = 'https://mcp.example.com/mcp';
const OTHER_RESOURCE = 'https://other-service.example.com/mcp';

let idp: FixtureIdpHandle;
let gate: McpAccessGate;

const request = (token?: string): Request =>
  new Request(`${RESOURCE}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  idp = await startFixtureIdp({ defaultAudience: RESOURCE, clients: [{ clientId: 'fixture-client' }] });
  gate = await createMcpAccessGate({
    issuer: idp.issuer,
    resource: RESOURCE,
    dangerouslyAllowInsecureIssuer: true,
  });
});

afterAll(async () => {
  await idp?.stop();
});

describe('Plane A access gate — accepts a correctly-scoped token', () => {
  it('resolves to the verified caller', async () => {
    const token = await idp.mintAccessToken({ audience: RESOURCE, scopes: ['mcp:tools'], subject: 'user-1' });
    const outcome = await gate.authorize(request(token));
    expect(outcome).not.toBeInstanceOf(Response);
    const auth = outcome as Exclude<typeof outcome, Response>;
    expect(auth.scopes).toEqual(['mcp:tools']);
    expect(auth.expiresAt).toBeTypeOf('number');
  });

  it('discovers the authorization server from the issuer alone', () => {
    expect(gate.authorizationServerMetadata.issuer).toBe(idp.issuer);
    expect(gate.authorizationServerMetadata.token_endpoint).toBe(idp.tokenEndpoint);
  });
});

describe('Plane A access gate — refuses everything else', () => {
  it('answers 401 with a WWW-Authenticate challenge when no token is presented', async () => {
    const outcome = await gate.authorize(request());
    expect(outcome).toBeInstanceOf(Response);
    const response = outcome as Response;
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('Bearer');
    // Without resource_metadata the client cannot discover where to authenticate,
    // which is the whole point of answering 401 rather than 403.
    expect(challenge).toContain('resource_metadata');
  });

  it('refuses a token minted for a DIFFERENT resource server (R11, confused deputy)', async () => {
    // Same issuer, same signing key, valid in every other respect — and still not ours.
    const token = await idp.mintAccessToken({ audience: OTHER_RESOURCE, scopes: ['mcp:tools'] });
    const outcome = await gate.authorize(request(token));
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const token = await idp.mintAccessToken({ audience: RESOURCE, expiresInSeconds: -60 });
    expect((await gate.authorize(request(token)) as Response).status).toBe(401);
  });

  it('refuses a token with no expiry at all', async () => {
    const token = await idp.mintAccessToken({ audience: RESOURCE, omitExpiry: true });
    expect((await gate.authorize(request(token)) as Response).status).toBe(401);
  });

  it('refuses a token signed by a key absent from the published JWKS', async () => {
    const token = await idp.mintAccessToken({ audience: RESOURCE, useForeignKey: true });
    expect((await gate.authorize(request(token)) as Response).status).toBe(401);
  });

  it('refuses a token from a different issuer', async () => {
    const token = await idp.mintAccessToken({ audience: RESOURCE, issuer: 'https://evil-idp.example.com' });
    expect((await gate.authorize(request(token)) as Response).status).toBe(401);
  });

  it('refuses a syntactically invalid token', async () => {
    expect((await gate.authorize(request('not-a-jwt')) as Response).status).toBe(401);
  });

  it('does not echo the presented token back in the error body', async () => {
    // An error body is a place secrets leak from (ADR-0006, R6).
    const token = await idp.mintAccessToken({ audience: OTHER_RESOURCE });
    const response = (await gate.authorize(request(token))) as Response;
    const body = await response.text();
    expect(body).not.toContain(token);
  });
});

describe('Plane A access gate — required scopes', () => {
  it('answers 403 insufficient_scope when a required scope is missing', async () => {
    const scoped = await createMcpAccessGate({
      issuer: idp.issuer,
      resource: RESOURCE,
      requiredScopes: ['mcp:tools'],
      dangerouslyAllowInsecureIssuer: true,
    });
    const token = await idp.mintAccessToken({ audience: RESOURCE, scopes: ['orders:read'] });
    const response = (await scoped.authorize(request(token))) as Response;
    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate') ?? '').toContain('insufficient_scope');
  });
});

describe('Plane A access gate — audiences that are not URLs', () => {
  // Found by running the Keycloak sandbox: real authorization servers mint an opaque
  // identifier, not the RFC 8707 resource URL. Rejecting those outright would leave Plane A
  // unusable against Keycloak, Entra ID and Auth0 alike.
  const OPAQUE = 'mcp-server';

  it('accepts an opaque audience that exactly matches the configured one', async () => {
    const gate2 = await createMcpAccessGate({
      issuer: idp.issuer,
      resource: RESOURCE,
      audience: OPAQUE,
      dangerouslyAllowInsecureIssuer: true,
    });
    const token = await idp.mintAccessToken({ audience: OPAQUE, scopes: ['mcp:tools'] });
    expect(await gate2.authorize(request(token))).not.toBeInstanceOf(Response);
  });

  it('refuses an audience that merely resembles the configured one', async () => {
    // Exact equality, never prefix matching — otherwise a staging server's token would be
    // accepted by production.
    const gate2 = await createMcpAccessGate({
      issuer: idp.issuer,
      resource: RESOURCE,
      audience: OPAQUE,
      dangerouslyAllowInsecureIssuer: true,
    });
    const token = await idp.mintAccessToken({ audience: `${OPAQUE}-staging`, scopes: ['mcp:tools'] });
    expect((await gate2.authorize(request(token))) as Response).toHaveProperty('status', 401);
  });

  it('still publishes the resource URL in discovery when the audience is opaque', async () => {
    const gate2 = await createMcpAccessGate({
      issuer: idp.issuer,
      resource: RESOURCE,
      audience: OPAQUE,
      dangerouslyAllowInsecureIssuer: true,
    });
    const response = gate2.metadata(new Request('https://mcp.example.com/.well-known/oauth-protected-resource/mcp'));
    const document = (await response!.json()) as { resource: string };
    expect(document.resource).toBe(RESOURCE);
  });
});

describe('Plane A access gate — construction refuses unsafe configuration', () => {
  it('rejects a plaintext issuer unless explicitly permitted', async () => {
    await expect(createMcpAccessGate({ issuer: idp.issuer, resource: RESOURCE })).rejects.toThrow(/not https/i);
  });

  it('rejects a plaintext issuer that is not on loopback, even with the escape hatch', async () => {
    // The escape hatch exists for a local fixture IdP. It must not cover a remote
    // plaintext issuer, or a testing convenience becomes a production foot-gun.
    await expect(
      createMcpAccessGate({
        issuer: 'http://idp.production.example.com',
        resource: RESOURCE,
        dangerouslyAllowInsecureIssuer: true,
      }),
    ).rejects.toThrow(/loopback/i);
  });

  it('rejects an unreachable issuer rather than starting unprotected', async () => {
    await expect(
      createMcpAccessGate({ issuer: 'http://127.0.0.1:1/nope', resource: RESOURCE, dangerouslyAllowInsecureIssuer: true }),
    ).rejects.toThrow(/could not discover/i);
  });
});

describe('Plane A access gate — discovery documents', () => {
  it('publishes RFC 9728 protected resource metadata naming the authorization server', async () => {
    const response = gate.metadata(new Request('https://mcp.example.com/.well-known/oauth-protected-resource/mcp'));
    expect(response).toBeDefined();
    const document = (await response!.json()) as { resource: string; authorization_servers: string[] };
    expect(document.resource).toBe(RESOURCE);
    expect(document.authorization_servers).toContain(idp.issuer);
  });

  it('returns undefined for a non-discovery route so the caller can fall through', () => {
    expect(gate.metadata(new Request('https://mcp.example.com/mcp'))).toBeUndefined();
  });
});
