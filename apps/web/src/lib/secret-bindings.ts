import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';

/** Every secret-binding *name* the playground needs a session-only value for to execute this tool for real — the tool's own bindings plus whichever of the project's upstream-auth fields are secret-sourced. */
export function secretNamesFor(config: McpProjectConfig, toolConfig: ToolConfig): string[] {
  const names = new Set<string>();

  for (const binding of Object.values(toolConfig.bindings)) {
    if (binding.source === 'secret') names.add(binding.name);
  }

  const auth = config.upstreamAuthentication;
  if (auth) {
    switch (auth.type) {
      case 'apiKey':
        if (auth.value.source === 'secret') names.add(auth.value.name);
        break;
      case 'bearer':
        if (auth.token.source === 'secret') names.add(auth.token.name);
        break;
      case 'basic':
        names.add(auth.password.name); // always a SecretBinding by schema
        break;
      case 'oauth2ClientCredentials':
        names.add(auth.clientSecret.name); // always a SecretBinding by schema
        if (auth.clientId.source === 'secret') names.add(auth.clientId.name);
        break;
    }
  }

  return [...names].sort();
}
