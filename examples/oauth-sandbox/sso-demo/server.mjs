import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

/**
 * The ordinary browser SSO flow, present purely for comparison.
 *
 * Everything the MCP flow does, this does too — redirect to the identity provider, come
 * back with a code, exchange it with PKCE, call the API with the resulting token. Seeing
 * them side by side is the point: the MCP flow is not a different protocol, it is this
 * one with the MCP client playing the part this page plays, and the MCP server playing
 * the part the orders API plays.
 */

const PORT = Number(process.env.PORT ?? 8282);
const ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8280/realms/mcpgen';
const CLIENT_ID = process.env.CLIENT_ID ?? 'sso-demo';
const ORDERS_API = process.env.ORDERS_API ?? 'http://localhost:8281';
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

/** In-memory and single-process: a sandbox, not a session store. */
const pending = new Map();

const base64url = (buf) => buf.toString('base64url');

function html(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>mcpgen OAuth sandbox</title>
<style>
 body{font:15px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:56rem;margin:3rem auto;padding:0 1.5rem;color:#0f172a}
 pre{background:#f1f5f9;padding:1rem;border-radius:.5rem;overflow-x:auto;font-size:13px}
 a.button{display:inline-block;background:#0f766e;color:#fff;padding:.6rem 1.1rem;border-radius:.5rem;text-decoration:none}
 h1{font-size:1.5rem} h2{font-size:1.1rem;margin-top:2rem}
 .muted{color:#475569}
</style></head><body>${body}</body></html>`;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (url.pathname === '/') {
      return res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          html(`<h1>Classic SSO, for comparison</h1>
<p class="muted">This is the flow you already know: this page redirects you to Keycloak, you sign in, Keycloak
redirects back here with a code, and this page exchanges it for an access token and calls the orders API.</p>
<p class="muted">The MCP flow is the same shape. The MCP <em>client</em> plays the part this page plays, and the
generated MCP server plays the part the orders API plays. The server never performs the redirect itself.</p>
<p><a class="button" href="/login">Sign in with Keycloak</a></p>`),
        );
    }

    if (url.pathname === '/login') {
      const verifier = base64url(randomBytes(32));
      const state = base64url(randomBytes(16));
      pending.set(state, verifier);

      const authorize = new URL(`${ISSUER}/protocol/openid-connect/auth`);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', CLIENT_ID);
      authorize.searchParams.set('redirect_uri', REDIRECT_URI);
      authorize.searchParams.set('scope', 'openid orders:read');
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', base64url(createHash('sha256').update(verifier).digest()));
      authorize.searchParams.set('code_challenge_method', 'S256');
      return res.writeHead(302, { location: authorize.href }).end();
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? '';
      const verifier = pending.get(state);
      pending.delete(state);
      if (!code || !verifier) {
        return res.writeHead(400, { 'content-type': 'text/html' }).end(html('<h1>Bad callback</h1><p>Missing code or unknown state.</p>'));
      }

      const tokenResponse = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code,
          code_verifier: verifier,
        }),
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok) {
        return res.writeHead(400, { 'content-type': 'text/html' }).end(html(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`));
      }

      const orders = await fetch(`${ORDERS_API}/orders`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
      const body = await orders.json().catch(() => ({ error: 'non-JSON response' }));

      const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString('utf8'));
      return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
        html(`<h1>Signed in</h1>
<h2>Who the API thinks you are</h2>
<pre>${JSON.stringify(body, null, 2)}</pre>
<h2>Access token claims</h2>
<p class="muted">Note <code>aud</code> and <code>scope</code> — the same two claims the generated MCP server checks on its own inbound tokens.</p>
<pre>${JSON.stringify({ iss: claims.iss, aud: claims.aud, scope: claims.scope, preferred_username: claims.preferred_username, exp: claims.exp }, null, 2)}</pre>
<p><a href="/">Start again</a></p>`),
      );
    }

    res.writeHead(404, { 'content-type': 'text/html' }).end(html('<h1>Not found</h1>'));
  })().catch((cause) => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/html' }).end(html(`<h1>Error</h1><pre>${cause.message}</pre>`));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`sso-demo listening on http://localhost:${PORT} — issuer ${ISSUER}`);
});
