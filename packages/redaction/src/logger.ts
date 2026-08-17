import process from 'node:process';

/**
 * TIP §25.2 / BR-009: on stdio, stdout is protocol-only. This is the *only*
 * legitimate place logging is written from — everywhere else calls through
 * this interface, and `no-console` is an ESLint error in runtime packages so
 * nothing bypasses it. The default sink writes to stderr, never stdout.
 */
export interface RuntimeLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface LogSink {
  write(chunk: string): void;
}

const stderrSink: LogSink = {
  write: (chunk) => {
    process.stderr.write(chunk);
  },
};

function emit(sink: LogSink, level: string, message: string, data?: unknown): void {
  const record: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  if (data !== undefined) record.data = data;
  sink.write(`${JSON.stringify(record)}\n`);
}

/**
 * @param sink Defaults to `process.stderr`. Inject a fake sink in tests so
 *   assertions don't depend on capturing the real stream.
 */
export function createLogger(sink: LogSink = stderrSink): RuntimeLogger {
  return {
    debug: (message, data) => emit(sink, 'debug', message, data),
    info: (message, data) => emit(sink, 'info', message, data),
    warn: (message, data) => emit(sink, 'warn', message, data),
    error: (message, data) => emit(sink, 'error', message, data),
  };
}
