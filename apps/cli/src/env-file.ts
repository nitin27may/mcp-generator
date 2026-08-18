import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

export interface EnvFileError {
  readonly path: string;
  readonly message: string;
}

/**
 * Loads one or more `.env`-shaped files into `process.env`, applied in order before any binding
 * resolution runs. Deliberately narrow: only sets a key that isn't already present in
 * `process.env` — the real environment always wins, which matters because this CLI is routinely
 * launched by an MCP client that has already injected `env` values of its own (VS Code, Claude
 * Desktop, ...). `process.loadEnvFile()` was considered and rejected for the opposite reason: it
 * overwrites already-set variables.
 *
 * Returns the first file that fails to read, if any — the caller decides how to report it and
 * whether to continue. A missing/unreadable file is never silently skipped: proceeding as if it
 * weren't there just yields a more confusing failure later, at binding-resolution time.
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
