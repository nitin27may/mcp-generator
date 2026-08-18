/** BRD §15.1's 11 content-steps map onto 10 routes — "Tool Selection" and "Tool Design" share `/tools`. */
export type WizardStepId = 'import' | 'validation' | 'readiness' | 'api' | 'auth' | 'tools' | 'bindings' | 'policy' | 'playground' | 'generate';

export interface WizardStepMeta {
  readonly id: WizardStepId;
  readonly order: number;
  readonly label: string;
  /**
   * Baseline skippability. Every step except Validation (blocking errors) and
   * Tools (zero enabled tools) has always been *technically* skippable — this
   * field is what the UI is allowed to *say* is skippable, which is a narrower
   * claim. Authentication's `true` here is conditional; resolve it through
   * `isStepOptional`, never by reading this field directly.
   */
  readonly optional: boolean;
}

export const WIZARD_STEPS: readonly WizardStepMeta[] = [
  { id: 'import', order: 0, label: 'Import', optional: false },
  { id: 'validation', order: 1, label: 'Validation', optional: false },
  { id: 'readiness', order: 2, label: 'Agent Readiness', optional: false },
  { id: 'api', order: 3, label: 'API Defaults', optional: false },
  { id: 'auth', order: 4, label: 'Authentication', optional: true },
  { id: 'tools', order: 5, label: 'Tools', optional: false },
  { id: 'bindings', order: 6, label: 'Parameter Binding', optional: false },
  { id: 'policy', order: 7, label: 'Safety', optional: true },
  { id: 'playground', order: 8, label: 'Test', optional: true },
  { id: 'generate', order: 9, label: 'Generate', optional: false },
];

export interface OptionalityInput {
  /** `true` when the project config carries an `upstreamAuthentication` block. */
  readonly hasUpstreamAuth: boolean;
}

/**
 * Whether a step may be *presented* as skippable.
 *
 * Safety and Test are unconditionally optional. Authentication is not: the
 * import seeds `upstreamAuthentication` from the spec's primary security
 * scheme (`seed-config.ts`), so an undefined block means the document declared
 * no scheme at all. An API that genuinely needs credentials must never be told
 * its auth step is skippable — the generated server would start and then fail
 * every upstream call.
 */
export function isStepOptional(stepId: WizardStepId, input: OptionalityInput): boolean {
  const step = WIZARD_STEPS.find((candidate) => candidate.id === stepId);
  if (step?.optional !== true) return false;
  if (stepId === 'auth') return !input.hasUpstreamAuth;
  return true;
}
