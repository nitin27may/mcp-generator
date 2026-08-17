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
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0] ?? 'serve';
  let configPath = './mcp.config.json';
  let specPath = './openapi.json';

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--config') configPath = argv[++i] ?? configPath;
    else if (argv[i] === '--spec') specPath = argv[++i] ?? specPath;
  }

  return { command, configPath, specPath };
}

async function main(): Promise<number> {
  const { command, configPath, specPath } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'serve':
      return runServe(configPath, specPath);
    case 'validate':
      return runValidate(configPath, specPath);
    case 'print-tools':
      return runPrintTools(configPath, specPath);
    case 'print-config':
      return runPrintConfig(configPath);
    default:
      process.stderr.write(`Unknown command "${command}". Expected: serve | validate | print-tools | print-config\n`);
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
