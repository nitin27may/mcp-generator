import type {
  ApiInfo,
  CanonicalSecurityScheme,
  CanonicalServer,
  Diagnostic,
  HttpMethod,
  SourceDocumentOrigin,
} from '@mcpgen/domain';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { ReadinessReport } from '@mcpgen/readiness-engine';
import type { RiskAssessment } from '@mcpgen/risk-engine';
import type { WizardStepId } from './steps.js';

export interface StepGate {
  readonly reachable: boolean;
  readonly complete: boolean;
  readonly blockedBy?: string;
}

export type StepGateState = Readonly<Record<WizardStepId, StepGate>>;

export interface OperationSummary {
  readonly id: string;
  readonly operationId?: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary?: string;
  readonly deprecated: boolean;
  readonly parameterCount: number;
  readonly hasRequestBody: boolean;
  readonly sourcePointer: string;
  readonly risk: RiskAssessment;
  readonly readinessFindingCount: number;
}

export interface OperationDetailParameter {
  readonly id: string;
  readonly sourceName: string;
  readonly location: string;
  readonly required: boolean;
  readonly description?: string;
  readonly schema: Record<string, unknown>;
}

export interface OperationDetail {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly parameters: readonly OperationDetailParameter[];
  readonly requestBody?: {
    readonly required: boolean;
    readonly contentType: string;
    readonly schema: Record<string, unknown>;
    readonly properties: readonly string[];
    readonly requiredProperties: readonly string[];
  };
  readonly responses: readonly { statusCode: string; description?: string; contentType?: string }[];
  readonly schemaBudget: { readonly withinBudget: boolean; readonly violations: readonly Diagnostic[] };
  readonly headerAnnotations: readonly Diagnostic[];
}

export interface ProjectAnalysis {
  readonly readiness: ReadinessReport;
  readonly risk: Readonly<Record<string, RiskAssessment>>;
  readonly analyzedAt: string;
  readonly sourceFingerprint: string;
}

export interface ProjectSourceInfo {
  readonly version: number;
  readonly format: 'json' | 'yaml';
  readonly declaredVersion: string;
  readonly rawFingerprint: string;
  readonly origin: SourceDocumentOrigin;
}

export interface ProjectApiInfo {
  readonly info: ApiInfo;
  readonly servers: readonly CanonicalServer[];
  readonly securitySchemes: readonly CanonicalSecurityScheme[];
  readonly operationCount: number;
}

/**
 * The server always computes `gates` (TIP §51/§53) regardless of what the
 * client asked for via `include=` — gate computation needs the full
 * on-disk project record, not just whatever subset got serialized into a
 * particular response. `operations`/`analysis`/`operationDetail` are the
 * only fields gated by `include=` (deliberately excludes the raw
 * `CanonicalApi` — dereferenced schemas can run to megabytes for a real spec).
 */
export interface ProjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly configRevision: number;
  readonly source: ProjectSourceInfo;
  readonly api: ProjectApiInfo;
  readonly config: McpProjectConfig;
  readonly importDiagnostics: readonly Diagnostic[];
  readonly gates: StepGateState;
  readonly analysis?: ProjectAnalysis;
  readonly operations?: readonly OperationSummary[];
  readonly operationDetail?: OperationDetail;
}
