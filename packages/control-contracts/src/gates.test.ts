import { describe, expect, it } from 'vitest';
import { computeGates, type GateInput } from './gates.js';

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    importHasErrors: false,
    enabledToolCount: 0,
    allEnabledToolsHaveRequiredBindings: false,
    configParses: true,
    allEnabledToolsResolveToOperations: true,
    startupValid: true,
    ...overrides,
  };
}

describe('computeGates', () => {
  it('import and readiness are always reachable and complete', () => {
    const gates = computeGates(input({ importHasErrors: true, configParses: false }));
    expect(gates.import).toEqual({ reachable: true, complete: true });
    expect(gates.readiness).toEqual({ reachable: true, complete: true });
  });

  it('validation is incomplete (with a reason) when the import had errors', () => {
    const gates = computeGates(input({ importHasErrors: true }));
    expect(gates.validation.complete).toBe(false);
    expect(gates.validation.blockedBy).toBeDefined();
  });

  it('api/auth/tools are unreachable while validation has errors', () => {
    const gates = computeGates(input({ importHasErrors: true }));
    expect(gates.api.reachable).toBe(false);
    expect(gates.auth.reachable).toBe(false);
    expect(gates.tools.reachable).toBe(false);
  });

  it('api/auth/tools become reachable once validation is clean, but tools is incomplete with zero enabled', () => {
    const gates = computeGates(input({ importHasErrors: false, enabledToolCount: 0 }));
    expect(gates.api.reachable).toBe(true);
    expect(gates.auth.reachable).toBe(true);
    expect(gates.tools.reachable).toBe(true);
    expect(gates.tools.complete).toBe(false);
  });

  it('bindings is unreachable until at least one tool is enabled', () => {
    const gates = computeGates(input({ enabledToolCount: 0 }));
    expect(gates.bindings.reachable).toBe(false);
  });

  it('bindings is reachable but incomplete when tools are enabled without full required bindings', () => {
    const gates = computeGates(input({ enabledToolCount: 2, allEnabledToolsHaveRequiredBindings: false }));
    expect(gates.bindings.reachable).toBe(true);
    expect(gates.bindings.complete).toBe(false);
  });

  it('policy is reachable only once bindings are complete', () => {
    const incomplete = computeGates(input({ enabledToolCount: 1, allEnabledToolsHaveRequiredBindings: false }));
    expect(incomplete.policy.reachable).toBe(false);

    const complete = computeGates(input({ enabledToolCount: 1, allEnabledToolsHaveRequiredBindings: true }));
    expect(complete.policy.reachable).toBe(true);
  });

  it('playground is reachable purely on configParses, independent of tool/binding state', () => {
    const gates = computeGates(input({ configParses: true, enabledToolCount: 0 }));
    expect(gates.playground.reachable).toBe(true);
  });

  it('playground is unreachable when the config does not parse', () => {
    const gates = computeGates(input({ configParses: false }));
    expect(gates.playground.reachable).toBe(false);
  });

  it('generate requires configParses, operation resolution, and startup validity all at once', () => {
    expect(computeGates(input({ configParses: false })).generate.reachable).toBe(false);
    expect(computeGates(input({ allEnabledToolsResolveToOperations: false })).generate.reachable).toBe(false);
    expect(computeGates(input({ startupValid: false })).generate.reachable).toBe(false);
    expect(
      computeGates(input({ configParses: true, allEnabledToolsResolveToOperations: true, startupValid: true })).generate.reachable,
    ).toBe(true);
  });
});
