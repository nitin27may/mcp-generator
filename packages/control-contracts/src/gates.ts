import type { StepGate, StepGateState } from './project.js';

/**
 * Flat, already-computed inputs rather than raw domain objects — keeps
 * `computeGates` pure and free of any package other than this one, so it can
 * run identically server-side (full knowledge of the on-disk project) and
 * client-side (the dirty wizard draft, approximating what it can). The
 * *computation* of each flag (e.g. `startupValid`, which needs
 * `validateStartupRequirements` from `@mcpgen/mcp-runtime`) lives in
 * `apps/web/src/server/*`, not here.
 *
 * `startupValid` is deliberately NOT used to gate `generate` (TIP §93 C30):
 * it's computed with a no-op env/secret resolver (no real deployment exists
 * yet in this ephemeral, no-accounts wizard), so *any* secret-sourced
 * binding anywhere in the config — the overwhelming majority of real APIs
 * need at least one, for auth — makes it `false` unconditionally. Gating
 * generation on it made "Generate" permanently unreachable for virtually
 * every realistic project. `allEnabledToolsHaveRequiredBindings` is the
 * right check here: every required field has *some* binding declared,
 * which is genuinely a design-time concern; whether that binding's value
 * resolves is a deploy-time concern the CLI's own `validate` command (which
 * `startupValid` mirrors) exists to answer against a real environment.
 */
export interface GateInput {
  readonly importHasErrors: boolean;
  readonly enabledToolCount: number;
  readonly allEnabledToolsHaveRequiredBindings: boolean;
  readonly configParses: boolean;
  readonly allEnabledToolsResolveToOperations: boolean;
  readonly startupValid: boolean;
}

/**
 * TIP §51/§53 gate rules. `readiness` never blocks on score — it's advisory
 * per the BRD; gating wizard progress on a number would be a product mistake.
 */
export function computeGates(input: GateInput): StepGateState {
  const validationComplete = !input.importHasErrors;
  const apiReachable = validationComplete;
  const authReachable = apiReachable;
  const toolsReachable = apiReachable;
  const toolsComplete = input.enabledToolCount > 0;
  const bindingsReachable = toolsComplete;
  const bindingsComplete = bindingsReachable && input.allEnabledToolsHaveRequiredBindings;
  const policyReachable = bindingsComplete;
  const playgroundReachable = input.configParses;
  const generateReachable = input.configParses && input.allEnabledToolsResolveToOperations && input.allEnabledToolsHaveRequiredBindings;

  const gate = (reachable: boolean, complete: boolean, blockedBy?: string): StepGate => ({
    reachable,
    complete,
    ...(blockedBy !== undefined ? { blockedBy } : {}),
  });

  return {
    import: gate(true, true),
    validation: gate(true, validationComplete, validationComplete ? undefined : 'The imported document has blocking errors'),
    readiness: gate(true, true),
    api: gate(apiReachable, apiReachable, apiReachable ? undefined : 'Fix validation errors first'),
    auth: gate(authReachable, authReachable, authReachable ? undefined : 'Fix validation errors first'),
    tools: gate(toolsReachable, toolsComplete, toolsComplete ? undefined : 'Enable at least one tool'),
    bindings: gate(bindingsReachable, bindingsComplete, bindingsReachable ? (bindingsComplete ? undefined : 'Bind every required parameter') : 'Enable at least one tool first'),
    policy: gate(policyReachable, policyReachable, policyReachable ? undefined : 'Complete parameter binding first'),
    playground: gate(playgroundReachable, playgroundReachable, playgroundReachable ? undefined : 'Fix the configuration first'),
    generate: gate(
      generateReachable,
      generateReachable,
      generateReachable ? undefined : 'Fix the configuration and bind every required parameter first',
    ),
  };
}
