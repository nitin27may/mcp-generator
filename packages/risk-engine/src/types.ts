/** TIP §15.1 */
export type RiskClassification = 'READ_ONLY' | 'WRITE' | 'DESTRUCTIVE' | 'PRIVILEGED' | 'UNKNOWN';

export interface RiskAssessment {
  readonly classification: RiskClassification;
  /** 0–1. Deterministic, not statistical — reflects how strong the matched signal is, not a learned probability. */
  readonly confidence: number;
  readonly reasons: readonly string[];
}
