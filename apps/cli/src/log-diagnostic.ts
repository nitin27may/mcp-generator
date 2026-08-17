import type { Diagnostic } from '@mcpgen/domain';
import type { RuntimeLogger } from '@mcpgen/redaction';

/** `warning`/`error` need attention; `recommendation`/`info` (e.g. IMP-006's auto-upgrade notice) don't. */
export function logDiagnostic(logger: RuntimeLogger, diagnostic: Diagnostic): void {
  const log = diagnostic.severity === 'error' ? logger.error : diagnostic.severity === 'warning' ? logger.warn : logger.info;
  log(diagnostic.message, { code: diagnostic.code });
}
