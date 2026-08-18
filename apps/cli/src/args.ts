/**
 * A declarative flag spec per command, driving one generic parser — extracted so a new command
 * (or a new flag on an existing one) is a data change here, not a second hand-rolled loop. The
 * CLI's original parser silently ignored unknown flags and flags used on the wrong command,
 * turned an invalid `--port` into `NaN`, and had no `--help`/`--version` at all — none of that is
 * acceptable in a binary meant to be `npm install -g`'d by a stranger.
 */

export const HELP_FLAGS = ['--help', '-h'] as const;
export const VERSION_FLAGS = ['--version', '-v'] as const;

/** 0: success. 1: the operation ran but failed (diagnostics were emitted). 2: usage error. */
export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export type FlagType =
  | { readonly kind: 'string' }
  | { readonly kind: 'int'; readonly min: number; readonly max: number }
  | { readonly kind: 'enum'; readonly values: readonly string[] };

export interface FlagSpec {
  readonly flag: string; // '--config'
  readonly placeholder: string; // 'path', shown in help as `--config <path>`
  readonly description: string;
  readonly type: FlagType;
  readonly default?: string;
  readonly repeatable?: boolean;
}

export interface CommandSpec {
  readonly name: string;
  readonly summary: string;
  readonly flags: readonly FlagSpec[];
}

const CONFIG_FLAG: FlagSpec = { flag: '--config', placeholder: 'path', description: 'Path to mcp.config.json', type: { kind: 'string' }, default: './mcp.config.json' };
const SPEC_FLAG: FlagSpec = { flag: '--spec', placeholder: 'path', description: 'Path to the OpenAPI/Swagger document', type: { kind: 'string' }, default: './openapi.json' };
// Named `--dotenv`, not `--env-file` — Node's own CLI recognizes `--env-file` as a native runtime
// flag and intercepts it (confirmed: it swallows the flag and errors on the value even when it
// appears after the script path in argv, well past where Node's own option parsing should have
// stopped), so a flag with that literal name here would never actually reach this parser.
const ENV_FILE_FLAG: FlagSpec = {
  flag: '--dotenv',
  placeholder: 'path',
  description: 'Load environment variables from a file before resolving bindings. A real environment variable always wins over one loaded this way.',
  type: { kind: 'string' },
  repeatable: true,
};

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'serve',
    summary: 'Start an MCP server for this config',
    flags: [
      CONFIG_FLAG,
      SPEC_FLAG,
      { flag: '--transport', placeholder: 'stdio|http', description: 'Transport to serve over', type: { kind: 'enum', values: ['stdio', 'http'] }, default: 'stdio' },
      { flag: '--host', placeholder: 'host', description: 'Host to bind (http transport only)', type: { kind: 'string' } },
      { flag: '--port', placeholder: 'port', description: 'Port to bind, 0 for any available port (http transport only)', type: { kind: 'int', min: 0, max: 65535 } },
      ENV_FILE_FLAG,
    ],
  },
  {
    name: 'validate',
    summary: 'Check a config against its spec and the current environment, without starting a server',
    flags: [CONFIG_FLAG, SPEC_FLAG, ENV_FILE_FLAG],
  },
  {
    name: 'print-tools',
    summary: 'Print the tool surface as JSON',
    flags: [CONFIG_FLAG, SPEC_FLAG],
  },
  {
    name: 'print-config',
    summary: 'Print the normalized config as JSON',
    flags: [CONFIG_FLAG],
  },
  {
    name: 'generate',
    summary: 'Build a redistributable MCP server package',
    flags: [
      CONFIG_FLAG,
      SPEC_FLAG,
      { flag: '--out', placeholder: 'dir', description: 'Output directory for the generated package', type: { kind: 'string' }, default: './dist-mcp' },
    ],
  },
];

// Every stored value is a string (even for 'int'-typed flags — readers convert on demand via
// optionalInt/optionalStr in cli.ts) or, for a repeatable flag, an array of them.
export type FlagValue = string | string[];
export type ParsedFlags = Readonly<Record<string, FlagValue>>;

export type ParseOutcome =
  | { readonly kind: 'help'; readonly command?: CommandSpec }
  | { readonly kind: 'version' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'command'; readonly command: CommandSpec; readonly flags: ParsedFlags };

function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name);
}

function keyOf(flag: string): string {
  return flag.replace(/^--/, '');
}

function validateValue(spec: FlagSpec, raw: string): string | { error: string } {
  switch (spec.type.kind) {
    case 'string':
      return raw;
    case 'enum':
      if (!spec.type.values.includes(raw)) {
        return { error: `Invalid value "${raw}" for ${spec.flag} — expected one of: ${spec.type.values.join(', ')}` };
      }
      return raw;
    case 'int': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < spec.type.min || n > spec.type.max) {
        return { error: `Invalid value "${raw}" for ${spec.flag} — expected an integer between ${spec.type.min} and ${spec.type.max}` };
      }
      return raw;
    }
  }
}

/**
 * A leading `-` in `argv[0]` is a flag, not a command name — `mcpgen --help`/`--version` work
 * with no command at all, and `mcpgen help <command>` is the word-form equivalent of
 * `mcpgen <command> --help`. Everything else is parsed against the named command's flag spec;
 * `--help`/`-h` anywhere in the remaining args short-circuits parsing immediately (a usage error
 * elsewhere in the same invocation shouldn't hide the help the user actually asked for).
 */
export function parseArgv(argv: readonly string[]): ParseOutcome {
  if (argv.length === 0) {
    const command = findCommand('serve')!;
    return { kind: 'command', command, flags: defaultsFor(command) };
  }

  if ((HELP_FLAGS as readonly string[]).includes(argv[0]!)) return { kind: 'help' };
  if ((VERSION_FLAGS as readonly string[]).includes(argv[0]!)) return { kind: 'version' };

  if (argv[0] === 'help') {
    const name = argv[1];
    if (name === undefined) return { kind: 'help' };
    const command = findCommand(name);
    if (!command) return { kind: 'error', message: `Unknown command "${name}". Expected: ${COMMANDS.map((c) => c.name).join(' | ')}` };
    return { kind: 'help', command };
  }

  const command = findCommand(argv[0]!);
  if (!command) {
    return { kind: 'error', message: `Unknown command "${argv[0]}". Expected: ${COMMANDS.map((c) => c.name).join(' | ')}` };
  }

  // Scanned up front, before validating anything else — a typo elsewhere in the same invocation
  // (an unparseable --port, an unknown flag) shouldn't hide the help the user actually asked for.
  const rest = argv.slice(1);
  if (rest.some((token) => (HELP_FLAGS as readonly string[]).includes(token))) return { kind: 'help', command };
  if (rest.some((token) => (VERSION_FLAGS as readonly string[]).includes(token))) return { kind: 'version' };

  const flags: Record<string, FlagValue> = {};
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i]!;
    const spec = command.flags.find((f) => f.flag === token);
    if (!spec) return { kind: 'error', message: `Unknown flag "${token}" for command "${command.name}". Run "mcpgen help ${command.name}" to see valid flags.` };

    const raw = argv[++i];
    if (raw === undefined) return { kind: 'error', message: `Flag ${spec.flag} requires a value.` };

    const validated = validateValue(spec, raw);
    if (typeof validated !== 'string') return { kind: 'error', message: validated.error };

    const key = keyOf(spec.flag);
    if (spec.repeatable) {
      const existing = flags[key];
      flags[key] = Array.isArray(existing) ? [...existing, validated] : [validated];
    } else {
      flags[key] = validated;
    }
  }

  return { kind: 'command', command, flags: { ...defaultsFor(command), ...flags } };
}

function defaultsFor(command: CommandSpec): ParsedFlags {
  const defaults: Record<string, FlagValue> = {};
  for (const spec of command.flags) {
    if (spec.default !== undefined) defaults[keyOf(spec.flag)] = spec.default;
  }
  return defaults;
}

export function renderHelp(command?: CommandSpec): string {
  if (!command) {
    const lines = [
      'mcpgen — generate and run governed MCP servers from an OpenAPI/Swagger document',
      '',
      'Usage: mcpgen <command> [flags]',
      '',
      'Commands:',
      ...COMMANDS.map((c) => `  ${c.name.padEnd(14)}${c.summary}`),
      '',
      'Run "mcpgen help <command>" or "mcpgen <command> --help" for a command\'s flags.',
      'Run "mcpgen --version" to print the CLI version.',
    ];
    return lines.join('\n');
  }

  const flagLines = command.flags.map((f) => {
    const left = `  ${f.flag} <${f.placeholder}>`;
    const suffix = f.default !== undefined ? ` (default: ${f.default})` : f.repeatable ? ' (repeatable)' : '';
    return `${left.padEnd(28)}${f.description}${suffix}`;
  });

  return [`Usage: mcpgen ${command.name} [flags]`, '', command.summary, '', 'Flags:', ...flagLines].join('\n');
}
