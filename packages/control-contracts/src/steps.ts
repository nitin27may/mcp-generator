/** BRD §15.1's 11 content-steps map onto 10 routes — "Tool Selection" and "Tool Design" share `/tools`. */
export type WizardStepId = 'import' | 'validation' | 'readiness' | 'api' | 'auth' | 'tools' | 'bindings' | 'policy' | 'playground' | 'generate';

export interface WizardStepMeta {
  readonly id: WizardStepId;
  readonly order: number;
  readonly label: string;
}

export const WIZARD_STEPS: readonly WizardStepMeta[] = [
  { id: 'import', order: 0, label: 'Import' },
  { id: 'validation', order: 1, label: 'Validation' },
  { id: 'readiness', order: 2, label: 'Agent Readiness' },
  { id: 'api', order: 3, label: 'API Defaults' },
  { id: 'auth', order: 4, label: 'Authentication' },
  { id: 'tools', order: 5, label: 'Tools' },
  { id: 'bindings', order: 6, label: 'Parameter Binding' },
  { id: 'policy', order: 7, label: 'Safety' },
  { id: 'playground', order: 8, label: 'Test' },
  { id: 'generate', order: 9, label: 'Generate' },
];
