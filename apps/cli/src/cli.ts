#!/usr/bin/env node
import process from 'node:process';
import { runServe } from './commands/serve.js';
import { runValidate } from './commands/validate.js';
import { runPrintTools } from './commands/print-tools.js';
import { runPrintConfig } from './commands/print-config.js';

interface ParsedArgs {
  readonly command: string;
  readonly configPath: string;
  readonly specPath: string;
  readonly transport: 'stdio' | 'http';
  readonly host?: string;
  readonly port?: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0] ?? 'serve';
  let configPath = './mcp.config.json';
  let specPath = './openapi.json';
  let transport: 'stdio' | 'http' = 'stdio'; // TIP §31: stdio is the default transport
  let host: string | undefined;
  let port: number | undefined;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--config') configPath = argv[++i] ?? configPath;
    else if (argv[i] === '--spec') specPath = argv[++i] ?? specPath;
    else if (argv[i] === '--transport') {
      const value = argv[++i];
      if (value === 'stdio' || value === 'http') transport = value;
    } else if (argv[i] === '--host') host = argv[++i];
    else if (argv[i] === '--port') {
      const value = argv[++i];
      if (value !== undefined) port = Number(value);
    }
  }

  return { command, configPath, specPath, transport, ...(host ? { host } : {}), ...(port !== undefined ? { port } : {}) };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'serve':
      return runServe(args.configPath, args.specPath, {
        transport: args.transport,
        ...(args.host ? { host: args.host } : {}),
        ...(args.port !== undefined ? { port: args.port } : {}),
      });
    case 'validate':
      return runValidate(args.configPath, args.specPath);
    case 'print-tools':
      return runPrintTools(args.configPath, args.specPath);
    case 'print-config':
      return runPrintConfig(args.configPath);
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
    process.stderr.write(`Fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
