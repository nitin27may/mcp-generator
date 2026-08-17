import { describe, expect, it } from 'vitest';
import { buildGenerationManifest } from './manifest.js';
import { buildReadme } from './readme.js';
import { config } from './test-helpers.js';

describe('buildReadme — TIP §73, all 12 required sections', () => {
  const manifest = buildGenerationManifest(config(), [], { generatedAt: '2026-01-01T00:00:00.000Z' });
  const readme = buildReadme(config(), manifest);

  it.each([
    'Tools exposed',
    'Supported transport',
    'Supported MCP protocol revision',
    'Required environment variables',
    'Secret variables',
    'Local stdio setup',
    'Client configuration example',
    'Troubleshooting',
    'Security notes',
    'Generated artifact versions',
  ])('includes a "%s" section', (heading) => {
    expect(readme).toContain(heading);
  });

  it('lists the enabled tool with its risk classification', () => {
    expect(readme).toContain('get_customer');
    expect(readme).toContain('READ_ONLY');
  });

  it('never embeds a real-looking secret value — only variable names', () => {
    expect(readme).not.toMatch(/CUSTOMER_API_KEY\s*=\s*["'`][^"'`\n]{6,}/);
  });

  it('includes a Docker section only when emitDockerfile is true', () => {
    const withDocker = buildReadme(config({ generation: { ...config().generation, emitDockerfile: true } }), manifest);
    const withoutDocker = buildReadme(config({ generation: { ...config().generation, emitDockerfile: false } }), manifest);
    expect(withDocker).toContain('## Docker');
    expect(withoutDocker).not.toContain('## Docker');
  });

  it('includes an HTTP transport section only when http is one of the configured transports', () => {
    const withHttp = buildReadme(config({ generation: { ...config().generation, transports: ['stdio', 'http'] } }), manifest);
    const withoutHttp = buildReadme(config({ generation: { ...config().generation, transports: ['stdio'] } }), manifest);
    expect(withHttp).toContain('Streamable HTTP');
    expect(withoutHttp).not.toContain('Streamable HTTP');
  });

  it('records the actual generated artifact versions, not aspirational ones', () => {
    expect(readme).toContain('2026-07-28');
    expect(readme).toContain('2026-01-01T00:00:00.000Z');
  });
});
