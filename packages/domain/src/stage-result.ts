import { hasErrors, type Diagnostic } from './diagnostic.js';

/**
 * TIP §8.1: every import-pipeline stage returns this instead of throwing, so a
 * downstream stage can still see partial progress and diagnostics from a stage
 * that only partly succeeded. Throwing would discard that.
 */
export interface StageStats {
  readonly durationMs?: number;
  readonly [key: string]: unknown;
}

export interface StageResult<T> {
  readonly value?: T;
  readonly diagnostics: Diagnostic[];
  readonly stats: StageStats;
}

export function stageOk<T>(
  value: T,
  diagnostics: Diagnostic[] = [],
  stats: StageStats = {},
): StageResult<T> {
  return { value, diagnostics, stats };
}

export function stageFail<T>(diagnostics: Diagnostic[], stats: StageStats = {}): StageResult<T> {
  return { diagnostics, stats };
}

/** True only when there is a value AND no error-severity diagnostic undermines it. */
export function isStageOk<T>(result: StageResult<T>): result is StageResult<T> & { value: T } {
  return result.value !== undefined && !hasErrors(result.diagnostics);
}
