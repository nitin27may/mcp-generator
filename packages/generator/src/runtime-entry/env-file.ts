import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

export interface EnvFileError {
  readonly path: string;
  readonly message: string;
}

/**
 * Mirrors apps/cli's env-file.ts — this is the runtime bundled into a *generated* package's own
 * dist/cli.mjs, a separate entry point that cannot import from apps/cli (apps-are-leaves). Only
 * sets a key that isn't already present in `process.env`; a real environment variable — the kind
 * an MCP client injects when it launches this server — always wins.
 */
export function applyEnvFiles(paths: readonly string[]): EnvFileError | undefined {
  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (error) {
      return { path, message: (error as Error).message };
    }
    const parsed = parseEnv(raw);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  return undefined;
}
