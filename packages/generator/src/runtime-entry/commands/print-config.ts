import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseProjectConfig } from '@mcpgen/config-schema';
import { createLogger } from '@mcpgen/redaction';

export function runPrintConfig(configPath: string): number {
  const logger = createLogger();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    logger.error(`Failed to read/parse "${configPath}"`, { message: (error as Error).message });
    return 1;
  }

  const result = parseProjectConfig(raw);
  if (!result.value) {
    for (const diagnostic of result.diagnostics) logger.error(diagnostic.message, { code: diagnostic.code });
    return 1;
  }

  process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
  return 0;
}
