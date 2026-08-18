import type { StepGate, StepGateState } from './project.js';

/**
 * Flat, already-computed inputs rather than raw domain objects — keeps
 * `computeGates` pure and free of any package other than this one, so it can
 * run identically server-side (full knowledge of the on-disk project) and
 * client-side (the dirty wizard draft, approximating what it can). The
 * *computation* of each flag (e.g. `startupValid`, which needs
 * `validateStartupRequirements` from `@mcpgen/mcp-runtime`) lives in
 * `apps/web/src/server/*`, not here.
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
  const generateReachable = input.configParses && input.allEnabledToolsResolveToOperations && input.startupValid;

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
      generateReachable ? undefined : 'Fix the configuration and startup requirements first',
    ),
  };
}
