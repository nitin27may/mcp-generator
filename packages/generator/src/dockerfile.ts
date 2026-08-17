import type { McpProjectConfig } from '@mcpgen/config-schema';

/**
 * TIP §24: multi-stage, non-root, secrets injected at runtime (never
 * baked in — there is nothing to bake in, since ADR-0006 means the shipped
 * config carries no secret literals). No build stage for compiling TS: the
 * generator already bundled dist/cli.mjs (self-contained mode), so the
 * image only needs to install the real external dependencies.
 */
export function buildDockerfile(config: McpProjectConfig): string {
  const hasHttp = config.generation.transports.includes('http');
  const healthcheck = hasHttp
    ? `HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"\n`
    : '';
  const cmd = hasHttp ? `CMD ["node", "dist/cli.mjs", "serve", "--transport", "http", "--host", "0.0.0.0", "--port", "3000"]` : `CMD ["node", "dist/cli.mjs", "serve"]`;

  return `# syntax=docker/dockerfile:1
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
RUN useradd --system --uid 1001 --create-home mcp
COPY --from=deps /app/node_modules ./node_modules
COPY package.json mcp.config.json generated-manifest.json ./
COPY dist ./dist
USER mcp
ENV NODE_ENV=production
${healthcheck}${cmd}
`;
}
