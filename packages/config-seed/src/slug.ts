/** `"Customer API"` -> `"customer-api"`. Never empty — falls back to a generic slug. */
export function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'mcp-project';
}

/**
 * `envName('customer-api', 'API_KEY')` -> `CUSTOMER_API_KEY`, not `CUSTOMER_API_API_KEY`.
 * When the slug's trailing token already matches the suffix's leading token, the suffix's
 * token is dropped rather than duplicated — a slug ending in "api" paired with a suffix
 * starting in "API" is the common case (any project whose name ends in "API"), and the
 * doubled form is confusing precisely where a user is most likely to actually read it:
 * `mcpgen init`'s summary output and the generated `.env.example`.
 */
export function envName(slug: string, suffix: string): string {
  const slugTokens = slug.toUpperCase().split('-').filter(Boolean);
  const suffixTokens = suffix.split('_').filter(Boolean);
  if (slugTokens.length > 0 && suffixTokens.length > 0 && slugTokens[slugTokens.length - 1] === suffixTokens[0]) {
    suffixTokens.shift();
  }
  return [...slugTokens, ...suffixTokens].join('_');
}

/**
 * Every environment-variable name this package derives, in one place — consumed by the web
 * wizard's seeder, the CLI's `init` command, and (eventually) the docs/client-config snippet
 * generators, so none of them can independently decide a variable is spelled differently.
 */
export interface DerivedEnvNames {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly token: string;
  readonly username: string;
  readonly password: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export function deriveEnvNames(slug: string): DerivedEnvNames {
  return {
    baseUrl: envName(slug, 'BASE_URL'),
    apiKey: envName(slug, 'API_KEY'),
    token: envName(slug, 'TOKEN'),
    username: envName(slug, 'USERNAME'),
    password: envName(slug, 'PASSWORD'),
    clientId: envName(slug, 'CLIENT_ID'),
    clientSecret: envName(slug, 'CLIENT_SECRET'),
  };
}
