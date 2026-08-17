import { describe, expect, it } from 'vitest';
import { buildDockerfile } from './dockerfile.js';
import { config } from './test-helpers.js';

describe('buildDockerfile — TIP §24', () => {
  it('is multi-stage', () => {
    const dockerfile = buildDockerfile(config());
    expect(dockerfile.match(/^FROM /gm)?.length).toBeGreaterThanOrEqual(2);
  });

  it('runs as a non-root user', () => {
    const dockerfile = buildDockerfile(config());
    expect(dockerfile).toContain('USER mcp');
    expect(dockerfile).toContain('useradd');
  });

  it('never bakes a secret into the image — install is from package.json only, config carries references not literals', () => {
    const dockerfile = buildDockerfile(config());
    expect(dockerfile).not.toMatch(/ENV\s+CUSTOMER_API_KEY/);
  });

  it('defaults CMD to stdio when http is not among the configured transports', () => {
    const dockerfile = buildDockerfile(config({ generation: { ...config().generation, transports: ['stdio'] } }));
    expect(dockerfile).toContain('"serve"]');
    expect(dockerfile).not.toContain('--transport');
  });

  it('CMDs into http mode and adds a HEALTHCHECK when http is configured', () => {
    const dockerfile = buildDockerfile(config({ generation: { ...config().generation, transports: ['stdio', 'http'] } }));
    expect(dockerfile).toContain('--transport", "http"');
    expect(dockerfile).toContain('HEALTHCHECK');
  });
});
