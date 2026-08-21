import { createServer } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * The sandbox's protected upstream: a small order API that does real OAuth2 resource-server
 * validation against the sandbox Keycloak realm.
 *
 * It is deliberately not a mock. The point of the sandbox is to show that the credential
 * arriving here is the one you expect — a service identity under client credentials, the
 * signed-in person under token exchange — and a mock that trusted any bearer token would
 * demonstrate nothing at all. So it verifies the signature against the realm's JWKS,
 * checks issuer and audience, enforces scopes per operation, and scopes every read to the
 * caller's own orders.
 *
 * `callerIdentity` is echoed on the list response for exactly one reason: it makes the
 * difference between the two upstream auth modes visible in the tool output, instead of
 * something you have to take on faith.
 */

const PORT = Number(process.env.PORT ?? 8281);
const ISSUER = process.env.OIDC_ISSUER ?? 'http://keycloak:8280/realms/mcpgen';
const AUDIENCE = process.env.OIDC_AUDIENCE ?? 'orders-api';

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`));

/** Seeded so a fresh `docker compose up` has something to read immediately. */
const orders = new Map([
  ['ord-1001', { id: 'ord-1001', customer: 'alice', status: 'shipped', total: 42.5, placedAt: '2026-08-01T10:00:00Z' }],
  ['ord-1002', { id: 'ord-1002', customer: 'alice', status: 'pending', total: 18.0, placedAt: '2026-08-14T09:30:00Z' }],
  ['ord-2001', { id: 'ord-2001', customer: 'bob', status: 'pending', total: 99.99, placedAt: '2026-08-15T16:45:00Z' }],
]);
let nextId = 3000;

function send(res, status, body) {
  if (body === undefined) return res.writeHead(status).end();
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function scopesOf(claims) {
  if (typeof claims.scope === 'string') return claims.scope.split(' ').filter(Boolean);
  if (Array.isArray(claims.scp)) return claims.scp;
  return [];
}

/**
 * Keycloak puts the human's username in `preferred_username` and a service account's in
 * `clientId`/`azp`. Distinguishing them is the whole demonstration: a client-credentials
 * token has no person behind it, so it cannot be scoped to one person's orders.
 */
function callerOf(claims) {
  if (typeof claims.preferred_username === 'string' && !claims.preferred_username.startsWith('service-account-')) {
    return { name: claims.preferred_username, isService: false };
  }
  return { name: claims.azp ?? claims.client_id ?? claims.sub ?? 'unknown', isService: true };
}

async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  const token = /^Bearer (.+)$/.exec(header)?.[1];
  if (!token) return { error: { status: 401, body: { error: 'unauthorized', detail: 'no bearer token presented' } } };

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(AUDIENCE)) {
      // The confused-deputy check. A token minted for some other service in this realm is
      // signed correctly and still must not be accepted here.
      return { error: { status: 401, body: { error: 'unauthorized', detail: `token audience ${JSON.stringify(audiences)} does not include "${AUDIENCE}"` } } };
    }
    return { claims: payload };
  } catch (cause) {
    return { error: { status: 401, body: { error: 'unauthorized', detail: cause.message } } };
  }
}

function requireScope(claims, scope) {
  return scopesOf(claims).includes(scope)
    ? undefined
    : { status: 403, body: { error: 'forbidden', detail: `token is missing the "${scope}" scope` } };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
    if (url.pathname === '/openapi.json') {
      const spec = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./openapi.json', import.meta.url), 'utf8'));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(spec);
    }

    const auth = await authenticate(req);
    if (auth.error) return send(res, auth.error.status, auth.error.body);
    const caller = callerOf(auth.claims);

    // A service identity has no person to scope to, so it sees everything. That is not a
    // bug in the sandbox — it is the limitation token exchange exists to remove, and it is
    // more convincing to show it than to describe it.
    const visible = () => [...orders.values()].filter((o) => caller.isService || o.customer === caller.name);

    const single = /^\/orders\/([^/]+)$/.exec(url.pathname);

    if (req.method === 'GET' && url.pathname === '/orders') {
      const denied = requireScope(auth.claims, 'orders:read');
      if (denied) return send(res, denied.status, denied.body);
      const status = url.searchParams.get('status');
      const items = visible().filter((o) => !status || o.status === status);
      return send(res, 200, { items, callerIdentity: caller.isService ? `service:${caller.name}` : `user:${caller.name}` });
    }

    if (req.method === 'POST' && url.pathname === '/orders') {
      const denied = requireScope(auth.claims, 'orders:write');
      if (denied) return send(res, denied.status, denied.body);
      const body = await readJson(req);
      if (typeof body.total !== 'number') return send(res, 400, { error: 'bad_request', detail: 'total is required and must be a number' });
      const order = {
        id: `ord-${nextId++}`,
        customer: caller.isService ? 'service' : caller.name,
        status: body.status ?? 'pending',
        total: body.total,
        placedAt: new Date().toISOString(),
      };
      orders.set(order.id, order);
      return send(res, 201, order);
    }

    if (req.method === 'GET' && single) {
      const denied = requireScope(auth.claims, 'orders:read');
      if (denied) return send(res, denied.status, denied.body);
      const order = visible().find((o) => o.id === single[1]);
      return order ? send(res, 200, order) : send(res, 404, { error: 'not_found', detail: `no order "${single[1]}" for this caller` });
    }

    if (req.method === 'DELETE' && single) {
      const denied = requireScope(auth.claims, 'orders:write');
      if (denied) return send(res, denied.status, denied.body);
      const order = visible().find((o) => o.id === single[1]);
      if (!order) return send(res, 404, { error: 'not_found', detail: `no order "${single[1]}" for this caller` });
      orders.delete(order.id);
      return send(res, 204, undefined);
    }

    send(res, 404, { error: 'not_found', detail: `no route for ${req.method} ${url.pathname}` });
  })().catch((cause) => {
    if (!res.headersSent) send(res, 500, { error: 'server_error', detail: cause.message });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`orders-api listening on :${PORT} — issuer ${ISSUER}, audience ${AUDIENCE}`);
});
