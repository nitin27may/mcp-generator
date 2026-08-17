import type { RuntimeLogger } from '@mcpgen/redaction';

/** TIP §17.4. `binding-engine` consumes this indirectly via a plain function — see resolve-value.ts there. */
export interface SecretResolver {
  get(name: string): Promise<string | undefined>;
}

/**
 * V1 provider (TIP §60). `env` defaults to `process.env` but is injectable
 * for tests — same pattern as `redaction`'s injectable log sink.
 */
export class EnvironmentSecretProvider implements SecretResolver {
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly logger: RuntimeLogger | undefined;

  constructor(options: { env?: Readonly<Record<string, string | undefined>>; logger?: RuntimeLogger } = {}) {
    this.env = options.env ?? process.env;
    this.logger = options.logger;
  }

  async get(name: string): Promise<string | undefined> {
    const value = this.env[name];
    // Log the *name*, never the value — a debug log is still an output
    // channel, and ADR-0006 doesn't carve out an exception for convenience.
    if (value === undefined) this.logger?.debug('secret not found in environment', { name });
    return value;
  }
}
