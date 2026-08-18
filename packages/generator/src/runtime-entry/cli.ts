// Not `#!/usr/bin/env node` here — bundle.ts's esbuild `banner` adds the real
// shebang to the bundled output. A second one here would double up (Node
// only exempts the file's first line, so line 2 becomes a syntax error —
// found by actually running the generated package, not by inspection).
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runPrintConfig } from './commands/print-config.js';
import { runPrintTools } from './commands/print-tools.js';
import { runServe } from './commands/serve.js';
import { runValidate } from './commands/validate.js';
import { applyEnvFiles } from './env-file.js';

// After bundling this becomes dist/cli.mjs; mcp.config.json and
// generated-manifest.json ship as siblings of dist/, one level up.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG_PATH = join(packageRoot, 'mcp.config.json');
const DEFAULT_MANIFEST_PATH = join(packageRoot, 'generated-manifest.json');

interface ParsedArgs {
  readonly command: string;
  readonly transport: 'stdio' | 'http';
  readonly host?: string;
  readonly port?: number;
  readonly envFiles: readonly string[];
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0] ?? 'serve';
  let transport: 'stdio' | 'http' = 'stdio';
  let host: string | undefined;
  let port: number | undefined;
  const envFiles: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--transport') {
      const value = argv[++i];
      if (value === 'stdio' || value === 'http') transport = value;
    } else if (argv[i] === '--host') host = argv[++i];
    else if (argv[i] === '--port') {
      const value = argv[++i];
      if (value !== undefined) port = Number(value);
    } else if (argv[i] === '--dotenv') {
      const value = argv[++i];
      if (value !== undefined) envFiles.push(value);
    }
  }

  return { command, transport, envFiles, ...(host ? { host } : {}), ...(port !== undefined ? { port } : {}) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'serve': {
      const envFileError = applyEnvFiles(args.envFiles);
      if (envFileError) {
        process.stderr.write(`Failed to read env file "${envFileError.path}": ${envFileError.message}\n`);
        return 1;
      }
      return runServe(DEFAULT_CONFIG_PATH, DEFAULT_MANIFEST_PATH, {
        transport: args.transport,
        ...(args.host ? { host: args.host } : {}),
        ...(args.port !== undefined ? { port: args.port } : {}),
      });
    }
    case 'validate': {
      const envFileError = applyEnvFiles(args.envFiles);
      if (envFileError) {
        process.stderr.write(`Failed to read env file "${envFileError.path}": ${envFileError.message}\n`);
        return 1;
      }
      return runValidate(DEFAULT_CONFIG_PATH, DEFAULT_MANIFEST_PATH);
    }
    case 'print-tools':
      return runPrintTools(DEFAULT_CONFIG_PATH, DEFAULT_MANIFEST_PATH);
    case 'print-config':
      return runPrintConfig(DEFAULT_CONFIG_PATH);
    default:
      process.stderr.write(`Unknown command "${args.command}". Expected: serve | validate | print-tools | print-config\n`);
      return 1;
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
