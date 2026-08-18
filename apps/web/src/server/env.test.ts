import { afterEach, describe, expect, it } from 'vitest';
import { getEnv } from './env.js';

const ENV_VAR = 'MCPGEN_ALLOW_PRIVATE_EGRESS';

describe('getEnv MCPGEN_ALLOW_PRIVATE_EGRESS parsing', () => {
  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('defaults to false when unset', () => {
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(false);
  });

  it('is false for the literal string "false" — the JS-truthiness trap `z.coerce.boolean()` would get wrong', () => {
    process.env[ENV_VAR] = 'false';
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(false);
  });

  it('is false for an empty string', () => {
    process.env[ENV_VAR] = '';
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(false);
  });

  it('is true for the literal string "true"', () => {
    process.env[ENV_VAR] = 'true';
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(true);
  });

  it('is true for "1"', () => {
    process.env[ENV_VAR] = '1';
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(true);
  });

  it('is false for an unrelated truthy-looking string', () => {
    process.env[ENV_VAR] = 'yes';
    expect(getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS).toBe(false);
  });
});
