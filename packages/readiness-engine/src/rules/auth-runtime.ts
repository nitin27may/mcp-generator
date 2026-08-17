import type { CanonicalApi } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessRule } from '../types.js';

/**
 * TIP §93 C5: FR-ARA-002 names 8 scoring dimensions but v1.0 shipped rules
 * for only 5 — authentication readiness (weight 10) and runtime
 * completeness (weight 5) had none, so those dimensions scored a vacuous
 * 100 and silently inflated the overall score by 15 points. These two rules
 * close that gap.
 */
export const noResolvableSecurity: ReadinessRule = {
  id: 'ARA-AUTH-001',
  category: 'authentication-readiness',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => op.security.length === 0)
      .map((op) => finding('ARA-AUTH-001', 'authentication-readiness', 'high', 'No resolvable security requirement', `${operationLabel(op)} has no security requirement — confirm this is intentionally public.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'If this should require authentication, add a security requirement to the operation or document.' }));
  },
};

export const noRuntimeServers: ReadinessRule = {
  id: 'ARA-RT-001',
  category: 'runtime-completeness',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.servers.length === 0
      ? [finding('ARA-RT-001', 'runtime-completeness', 'high', 'No server/base URL declared', 'The document declares no servers, so there is no default base URL to bind.', { remediation: 'Add a servers entry, or require the base URL to be supplied explicitly at configuration time.' })]
      : [];
  },
};

export const authRuntimeRules: ReadinessRule[] = [noResolvableSecurity, noRuntimeServers];
