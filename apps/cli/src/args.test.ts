import { describe, expect, it } from 'vitest';
import { COMMANDS, parseArgv, renderHelp } from './args.js';

describe('parseArgv — defaults and dispatch', () => {
  it('defaults to serve with every flag default applied when argv is empty', () => {
    const outcome = parseArgv([]);
    expect(outcome).toEqual({
      kind: 'command',
      command: COMMANDS.find((c) => c.name === 'serve'),
      flags: { config: './mcp.config.json', spec: './openapi.json', transport: 'stdio' },
    });
  });

  it('parses a known command with explicit flag values, overriding defaults', () => {
    const outcome = parseArgv(['serve', '--config', './x.json', '--transport', 'http', '--port', '3000']);
    expect(outcome).toEqual({
      kind: 'command',
      command: COMMANDS.find((c) => c.name === 'serve'),
      flags: { config: './x.json', spec: './openapi.json', transport: 'http', port: '3000' },
    });
  });

  it('collects a repeatable flag into an array, preserving order', () => {
    const outcome = parseArgv(['serve', '--dotenv', 'a.env', '--dotenv', 'b.env']);
    expect(outcome.kind).toBe('command');
    expect((outcome as { flags: Record<string, unknown> }).flags['dotenv']).toEqual(['a.env', 'b.env']);
  });
});

describe('parseArgv — usage errors (exit 2)', () => {
  it('reports an unknown command', () => {
    const outcome = parseArgv(['frobnicate']);
    expect(outcome).toEqual({ kind: 'error', message: expect.stringContaining('Unknown command "frobnicate"') });
  });

  it('reports a flag that is not valid for the given command', () => {
    const outcome = parseArgv(['print-config', '--transport', 'http']);
    expect(outcome).toEqual({ kind: 'error', message: expect.stringContaining('Unknown flag "--transport" for command "print-config"') });
  });

  it('reports a flag given with no value', () => {
    const outcome = parseArgv(['serve', '--config']);
    expect(outcome).toEqual({ kind: 'error', message: 'Flag --config requires a value.' });
  });

  it('rejects a non-integer port rather than silently producing NaN', () => {
    const outcome = parseArgv(['serve', '--port', 'abc']);
    expect(outcome).toEqual({ kind: 'error', message: expect.stringContaining('Invalid value "abc" for --port') });
  });

  it('rejects a port outside the valid range', () => {
    expect(parseArgv(['serve', '--port', '70000'])).toEqual({ kind: 'error', message: expect.stringContaining('Invalid value "70000" for --port') });
    expect(parseArgv(['serve', '--port', '-1'])).toEqual({ kind: 'error', message: expect.stringContaining('Invalid value "-1" for --port') });
  });

  it('accepts port 0 — the OS-picks-a-free-port convention, not a usage error', () => {
    const outcome = parseArgv(['serve', '--transport', 'http', '--port', '0']);
    expect(outcome.kind).toBe('command');
  });

  it('rejects an invalid transport rather than silently downgrading to stdio', () => {
    const outcome = parseArgv(['serve', '--transport', 'websocket']);
    expect(outcome).toEqual({ kind: 'error', message: expect.stringContaining('Invalid value "websocket" for --transport') });
  });
});

describe('parseArgv — boolean flags (init)', () => {
  it('records a bare boolean flag as present, without consuming the next token as its value', () => {
    const outcome = parseArgv(['init', '--spec', './openapi.json', '--enable-read-only', '--force']);
    expect(outcome).toEqual({
      kind: 'command',
      command: COMMANDS.find((c) => c.name === 'init'),
      flags: { spec: './openapi.json', out: './mcp.config.json', transport: 'stdio', 'enable-read-only': 'true', force: 'true' },
    });
  });

  it('a boolean flag absent from argv is simply absent from the parsed flags, not defaulted to false', () => {
    const outcome = parseArgv(['init']);
    expect(outcome.kind).toBe('command');
    expect((outcome as { flags: Record<string, unknown> }).flags['force']).toBeUndefined();
  });

  it('collects repeatable --enable values in order, alongside a boolean flag', () => {
    const outcome = parseArgv(['init', '--enable', 'getCustomer', '--enable-read-only', '--enable', 'listCustomers']);
    expect(outcome.kind).toBe('command');
    const flags = (outcome as { flags: Record<string, unknown> }).flags;
    expect(flags['enable']).toEqual(['getCustomer', 'listCustomers']);
    expect(flags['enable-read-only']).toBe('true');
  });
});

describe('parseArgv — help and version', () => {
  it('recognizes --help and -h as general help with no command', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgv(['-h'])).toEqual({ kind: 'help' });
  });

  it('recognizes --version and -v', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgv(['-v'])).toEqual({ kind: 'version' });
  });

  it('supports "mcpgen help <command>"', () => {
    const outcome = parseArgv(['help', 'serve']);
    expect(outcome).toEqual({ kind: 'help', command: COMMANDS.find((c) => c.name === 'serve') });
  });

  it('"mcpgen help <unknown>" is a usage error, not a silent no-op', () => {
    expect(parseArgv(['help', 'frobnicate']).kind).toBe('error');
  });

  it('supports "mcpgen <command> --help", winning over an otherwise-invalid invocation', () => {
    const outcome = parseArgv(['serve', '--port', 'not-a-number', '--help']);
    expect(outcome).toEqual({ kind: 'help', command: COMMANDS.find((c) => c.name === 'serve') });
  });
});

describe('renderHelp', () => {
  it('lists every command in the general help text', () => {
    const text = renderHelp();
    for (const command of COMMANDS) expect(text).toContain(command.name);
  });

  it('lists every flag of a specific command', () => {
    const serve = COMMANDS.find((c) => c.name === 'serve')!;
    const text = renderHelp(serve);
    for (const flag of serve.flags) expect(text).toContain(flag.flag);
  });
});
