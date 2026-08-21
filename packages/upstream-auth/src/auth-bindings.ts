import type { UpstreamAuthentication, ValueBinding } from '@mcpgen/config-schema';

/**
 * Extracts the binding(s) embedded in an upstream auth config, under stable
 * synthetic keys. The caller (`upstream-http`, which depends on both this
 * package and `binding-engine`) resolves these the same way it resolves tool
 * bindings, then passes the results to `attachUpstreamAuth`. This package
 * deliberately does not depend on `binding-engine` itself (TIP §5 scopes it
 * to `config-schema` + `redaction`) — it only says *which* keys need
 * resolving, not *how*.
 */
export function authBindingsOf(auth: UpstreamAuthentication): Record<string, ValueBinding> {
  switch (auth.type) {
    case 'apiKey':
      return { value: auth.value };
    case 'bearer':
      return { token: auth.token };
    case 'basic':
      return { username: auth.username, password: auth.password };
    case 'oauth2ClientCredentials':
    case 'oauth2TokenExchange':
      return { clientId: auth.clientId, clientSecret: auth.clientSecret };
  }
}
