import type { Diagnostic } from '@mcpgen/domain';
import type { ValueBinding } from '@mcpgen/config-schema';

/**
 * TIP §17.1/§17.3. Deliberately duck-typed rather than importing
 * `upstream-auth`'s `SecretResolver`: `binding-engine` depends only on
 * `config-schema` and `domain` (TIP §5) — the concrete secret provider is
 * wired in by whoever calls this (`upstream-http`, P0-W09-T01).
 */
export interface BindingResolutionContext {
  /** Arguments from the MCP tool call. The SDK already validated these against inputSchema (research notes §5) — this stage starts after that. */
  readonly toolInput: Record<string, unknown>;
  readonly getEnv: (name: string) => string | undefined;
  readonly resolveSecret: (name: string) => Promise<string | undefined>;
}

interface ResolvedValue {
  readonly value?: string;
  readonly diagnostic?: Diagnostic;
}

function pointerFor(key: string): string {
  return `#/bindings/${key}`;
}

async function resolveOne(key: string, binding: ValueBinding, ctx: BindingResolutionContext): Promise<ResolvedValue> {
  switch (binding.source) {
    case 'tool-input': {
      const raw = ctx.toolInput[binding.inputName];
      return raw === undefined ? {} : { value: String(raw) };
    }

    case 'environment': {
      const fromEnv = ctx.getEnv(binding.name);
      if (fromEnv !== undefined) return { value: fromEnv };
      if (binding.defaultValue !== undefined) return { value: String(binding.defaultValue) };
      if (binding.required === false) return {};
      return {
        diagnostic: {
          severity: 'error',
          code: 'BND-005',
          message: `Unresolved environment variable "${binding.name}"`,
          sourcePointer: pointerFor(key),
        },
      };
    }

    case 'secret': {
      const resolved = await ctx.resolveSecret(binding.name);
      if (resolved !== undefined) return { value: resolved };
      return {
        diagnostic: {
          severity: 'error',
          code: 'AUT-001',
          message: `Upstream credential "${binding.name}" not found`,
          sourcePointer: pointerFor(key),
        },
      };
    }

    case 'static': {
      // A `null` static value means "intentionally absent" — omitted, not
      // stringified to the literal text "null".
      return binding.value === null ? {} : { value: String(binding.value) };
    }
  }
}

/**
 * Resolves every binding to a string value (or omits it, when a value is
 * legitimately absent — an optional env var with no default, a tool input
 * the agent didn't supply). Errors are collected as diagnostics rather than
 * thrown, so the caller sees every problem in one pass rather than the first.
 */
export async function resolveBindingValues(
  bindings: Readonly<Record<string, ValueBinding>>,
  ctx: BindingResolutionContext,
): Promise<{ values: Record<string, string>; diagnostics: Diagnostic[] }> {
  const values: Record<string, string> = {};
  const diagnostics: Diagnostic[] = [];

  for (const [key, binding] of Object.entries(bindings)) {
    const resolved = await resolveOne(key, binding, ctx);
    if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
    else if (resolved.value !== undefined) values[key] = resolved.value;
  }

  return { values, diagnostics };
}
