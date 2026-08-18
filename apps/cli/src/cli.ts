#!/usr/bin/env node
import process from 'node:process';
import { runServe } from './commands/serve.js';
import { runValidate } from './commands/validate.js';
import { runPrintTools } from './commands/print-tools.js';
import { runPrintConfig } from './commands/print-config.js';
import { runGenerate } from './commands/generate.js';
import { runInit } from './commands/init.js';
import { applyEnvFiles } from './env-file.js';
import { CLI_VERSION } from './version.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, parseArgv, renderHelp, type ParsedFlags } from './args.js';

function str(flags: ParsedFlags, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string') throw new Error(`internal error: flag "${key}" has no default and was not required`);
  return value;
}

function optionalStr(flags: ParsedFlags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalInt(flags: ParsedFlags, key: string): number | undefined {
  const value = flags[key];
  return typeof value === 'string' ? Number(value) : undefined;
}

function stringArray(flags: ParsedFlags, key: string): readonly string[] {
  const value = flags[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Boolean flags are stored as the literal string 'true' when present (args.ts) — absence means false. */
function flag(flags: ParsedFlags, key: string): boolean {
  return flags[key] === 'true';
}

/** Applied before touching any secret/environment binding — a real environment variable always wins over one loaded this way (env-file.ts). Failure here is a usage error, not an operation failure: the config/spec were never even read. */
async function loadEnvFiles(flags: ParsedFlags): Promise<number | undefined> {
  const error = applyEnvFiles(stringArray(flags, 'dotenv'));
  if (!error) return undefined;
  process.stderr.write(`Failed to read env file "${error.path}": ${error.message}\n`);
  return EXIT_USAGE;
}

async function dispatch(command: string, flags: ParsedFlags): Promise<number> {
  switch (command) {
    case 'serve': {
      const envFileFailure = await loadEnvFiles(flags);
      if (envFileFailure !== undefined) return envFileFailure;
      const host = optionalStr(flags, 'host');
      const port = optionalInt(flags, 'port');
      return runServe(str(flags, 'config'), str(flags, 'spec'), {
        transport: str(flags, 'transport') as 'stdio' | 'http',
        ...(host !== undefined ? { host } : {}),
        ...(port !== undefined ? { port } : {}),
      });
    }
    case 'validate': {
      const envFileFailure = await loadEnvFiles(flags);
      if (envFileFailure !== undefined) return envFileFailure;
      return runValidate(str(flags, 'config'), str(flags, 'spec'));
    }
    case 'print-tools':
      return runPrintTools(str(flags, 'config'), str(flags, 'spec'));
    case 'print-config':
      return runPrintConfig(str(flags, 'config'));
    case 'generate':
      return runGenerate(str(flags, 'config'), str(flags, 'spec'), str(flags, 'out'));
    case 'init': {
      const name = optionalStr(flags, 'name');
      const packageName = optionalStr(flags, 'package-name');
      const binName = optionalStr(flags, 'bin-name');
      return runInit(str(flags, 'spec'), str(flags, 'out'), {
        transport: str(flags, 'transport') as 'stdio' | 'http',
        enableReadOnly: flag(flags, 'enable-read-only'),
        enableNames: stringArray(flags, 'enable'),
        force: flag(flags, 'force'),
        json: flag(flags, 'json'),
        ...(name !== undefined ? { name } : {}),
        ...(packageName !== undefined ? { packageName } : {}),
        ...(binName !== undefined ? { binName } : {}),
      });
    }
    default:
      // Unreachable: parseArgv only ever returns a 'command' outcome for a name found in COMMANDS.
      return EXIT_USAGE;
  }
}

async function main(): Promise<number> {
  const outcome = parseArgv(process.argv.slice(2));

  switch (outcome.kind) {
    case 'help':
      process.stdout.write(`${renderHelp(outcome.command)}\n`);
      return EXIT_OK;
    case 'version':
      process.stdout.write(`${CLI_VERSION}\n`);
      return EXIT_OK;
    case 'error':
      process.stderr.write(`${outcome.message}\n`);
      return EXIT_USAGE;
    case 'command':
      return dispatch(outcome.command.name, outcome.flags);
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = EXIT_FAILURE;
  });
