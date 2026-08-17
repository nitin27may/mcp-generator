import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';
import { authBindingsOf } from '@mcpgen/upstream-auth';
import type { GenerationManifest } from './manifest.js';

function envNames(bindings: Readonly<Record<string, ValueBinding>>, sensitive: boolean): string[] {
  return Object.values(bindings)
    .filter((b): b is Extract<ValueBinding, { source: 'environment' | 'secret' }> => b.source === (sensitive ? 'secret' : 'environment'))
    .map((b) => b.name);
}

/** TIP §73 — all 12 required sections. */
export function buildReadme(config: McpProjectConfig, manifest: GenerationManifest): string {
  const { generation } = config;
  const enabledTools = Object.values(config.tools).filter((t) => t.enabled);

  const allBindings: Record<string, ValueBinding>[] = [
    { baseUrl: config.api.baseUrl },
    ...(config.upstreamAuthentication ? [authBindingsOf(config.upstreamAuthentication)] : []),
    ...enabledTools.map((t) => t.bindings),
  ];
  const required = new Set(allBindings.flatMap((b) => envNames(b, false)));
  const secrets = new Set(allBindings.flatMap((b) => envNames(b, true)));

  const toolList = enabledTools.map((t) => `- **${t.name}** (${t.risk}) — ${t.description}`).join('\n');
  const envList = [...required].sort().map((n) => `- \`${n}\``).join('\n') || '_none_';
  const secretList = [...secrets].sort().map((n) => `- \`${n}\` — set via your secret manager, never commit a real value`).join('\n') || '_none_';
  const transportList = generation.transports.join(', ');
  const httpExample = generation.transports.includes('http')
    ? `\n### Streamable HTTP\n\n\`\`\`bash\nnpx ${generation.packageName} serve --transport http --host 127.0.0.1 --port 3000\n\`\`\`\n\nBinds to \`127.0.0.1\` by default. The MCP endpoint is \`http://127.0.0.1:3000/mcp\`; \`/health\` and \`/ready\` are separate from it.\n`
    : '';
  const dockerSection = generation.emitDockerfile
    ? `\n## Docker\n\n\`\`\`bash\ndocker build -t ${generation.packageName.replace('@', '').replace('/', '-')} .\ndocker run --rm -it --env-file .env ${generation.packageName.replace('@', '').replace('/', '-')}\n\`\`\`\n`
    : '';

  return `# ${generation.packageName}

Generated MCP server for **${config.project.name}**${config.project.description ? ` — ${config.project.description}` : ''}.

## Tools exposed

${toolList || '_none enabled_'}

## Supported transport(s)

${transportList}

## Supported MCP protocol revision

**${manifest.mcpProtocolTarget}** — the actual negotiated revision is confirmed live via \`server/discover\`, not just asserted here. Connecting with a client that has not opted into the modern era (most clients default to a legacy \`initialize\` opening) will be rejected — this is correct behavior, not a bug.

## Required environment variables

${envList}

## Secret variables

${secretList}

## Local stdio setup

\`\`\`bash
cp .env.example .env   # fill in the values above
npx ${generation.packageName}
\`\`\`
${httpExample}${dockerSection}
## Client configuration example

\`\`\`json
{
  "mcpServers": {
    "${generation.binName}": {
      "command": "npx",
      "args": ["${generation.packageName}"],
      "env": { ${[...required, ...secrets].map((n) => `"${n}": "<${n.toLowerCase()}>"`).join(', ')} }
    }
  }
}
\`\`\`

## Troubleshooting

- **Server exits immediately with a stderr message naming a missing variable** — an environment
  variable or secret listed above was not set. Startup fails fast and writes nothing to stdout when
  this happens (BR-009).
- **Client reports an unsupported protocol version** — your MCP client is using the legacy
  \`initialize\` opening by default. Configure it to negotiate the modern era, or use \`server/discover\`.
- **\`tools/call\` returns \`isError: true\` with an upstream error** — check the tool's \`content\` for
  the underlying HTTP status; secrets are never included in error output.

## Security notes

- Secrets are never embedded in this package or its configuration — \`mcp.config.json\` contains
  references only (ADR-0006).
- The upstream API credential (Plane B) is never derived from or forwarded as an inbound MCP access
  token (Plane A) — these are separate credential planes (ADR-0005).
- Destructive and bulk operations are never auto-enabled; every enabled tool here was deliberately
  curated.

## Generated artifact versions

- Generator: \`${manifest.generatorVersion}\`
- Config schema: \`${manifest.configSchemaVersion}\`
- MCP protocol target: \`${manifest.mcpProtocolTarget}\`
- Generated at: \`${manifest.generatedAt}\`
`;
}
