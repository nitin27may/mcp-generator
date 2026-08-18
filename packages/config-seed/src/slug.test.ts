import { describe, expect, it } from 'vitest';
import { deriveEnvNames, envName, slugify } from './slug.js';

describe('slugify', () => {
  it('lowercases, hyphenates, and trims', () => {
    expect(slugify('Customer API')).toBe('customer-api');
    expect(slugify('  Some Weird!! Project Name_123  ')).toBe('some-weird-project-name-123');
  });

  it('falls back to a generic slug rather than producing an empty string', () => {
    expect(slugify('!!!')).toBe('mcp-project');
  });
});

describe('envName', () => {
  it('joins a slug and a suffix with an underscore in the ordinary case', () => {
    expect(envName('customer-api', 'BASE_URL')).toBe('CUSTOMER_API_BASE_URL');
    expect(envName('customer-api', 'TOKEN')).toBe('CUSTOMER_API_TOKEN');
  });

  it('does not duplicate a token the slug already ends with', () => {
    expect(envName('customer-api', 'API_KEY')).toBe('CUSTOMER_API_KEY');
    expect(envName('api', 'API_KEY')).toBe('API_KEY');
  });

  it('collapses to the bare slug when the suffix is entirely the repeated token', () => {
    expect(envName('customer-api', 'API')).toBe('CUSTOMER_API');
  });
});

describe('deriveEnvNames', () => {
  it('derives all seven names from one slug, consistently', () => {
    expect(deriveEnvNames('customer-api')).toEqual({
      baseUrl: 'CUSTOMER_API_BASE_URL',
      apiKey: 'CUSTOMER_API_KEY',
      token: 'CUSTOMER_API_TOKEN',
      username: 'CUSTOMER_API_USERNAME',
      password: 'CUSTOMER_API_PASSWORD',
      clientId: 'CUSTOMER_API_CLIENT_ID',
      clientSecret: 'CUSTOMER_API_CLIENT_SECRET',
    });
  });
});
