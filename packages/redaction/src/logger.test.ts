import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, type LogSink } from './logger.js';

function captureSink(): { sink: LogSink; lines: () => string[] } {
  const chunks: string[] = [];
  return { sink: { write: (chunk) => chunks.push(chunk) }, lines: () => chunks };
}

describe('createLogger', () => {
  it('writes one JSON line per call, terminated by a newline', () => {
    const { sink, lines } = captureSink();
    createLogger(sink).info('hello');
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines()[0]!)).toMatchObject({ level: 'info', message: 'hello' });
  });

  it.each(['debug', 'info', 'warn', 'error'] as const)('supports level %s', (level) => {
    const { sink, lines } = captureSink();
    createLogger(sink)[level]('m');
    expect(JSON.parse(lines()[0]!).level).toBe(level);
  });

  it('includes structured data when provided, and omits the field when not', () => {
    const { sink, lines } = captureSink();
    const logger = createLogger(sink);
    logger.info('with data', { code: 'X-001' });
    logger.info('without data');
    expect(JSON.parse(lines()[0]!).data).toEqual({ code: 'X-001' });
    expect(JSON.parse(lines()[1]!)).not.toHaveProperty('data');
  });

  it('includes an ISO timestamp', () => {
    const { sink, lines } = captureSink();
    createLogger(sink).info('m');
    const record = JSON.parse(lines()[0]!);
    expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
  });

  describe('default sink', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('writes to process.stderr, never stdout — BR-009', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      createLogger().warn('goes to stderr');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });
});
