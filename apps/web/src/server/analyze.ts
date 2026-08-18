import { analyzeReadiness } from '@mcpgen/readiness-engine';
import { classifyApi } from '@mcpgen/risk-engine';
import type { ProjectAnalysis } from '@mcpgen/control-contracts';
import type { CanonicalApi } from '@mcpgen/domain';
import { readProjectAnalysis, writeProjectAnalysis } from './project-store';

/**
 * `POST /api/projects/:id/analyze`. Deterministic and pure (ADR-0007) —
 * skips recompute when the stored analysis' `sourceFingerprint` still
 * matches the current source version, unless `force` is set.
 */
export async function performAnalyze(
  projectId: string,
  version: number,
  canonicalApi: CanonicalApi,
  rawFingerprint: string,
  force: boolean,
): Promise<ProjectAnalysis> {
  if (!force) {
    const existing = await readProjectAnalysis(projectId, version);
    if (existing && existing.sourceFingerprint === rawFingerprint) return existing;
  }

  const analysis: ProjectAnalysis = {
    readiness: analyzeReadiness(canonicalApi),
    risk: classifyApi(canonicalApi),
    analyzedAt: new Date().toISOString(),
    sourceFingerprint: rawFingerprint,
  };
  await writeProjectAnalysis(projectId, version, analysis);
  return analysis;
}
