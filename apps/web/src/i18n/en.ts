/**
 * BRD §35: MVP is English-only, but no concatenated user-facing strings —
 * every string lives here, flat keys, so a future locale is a second file
 * with the same shape, not a hunt through JSX for hardcoded text.
 */
export const en = {
  appName: 'mcpgen',
  appTagline: 'Import an OpenAPI spec, configure it, generate a governed MCP server.',

  importTitle: 'Import an OpenAPI/Swagger document',
  importSubtitle: 'Paste, upload, or fetch from a URL. JSON or YAML, Swagger 2.0 through OpenAPI 3.1.',
  importTabPaste: 'Paste',
  importTabUpload: 'Upload',
  importTabUrl: 'URL',
  importPasteLabel: 'OpenAPI document',
  importPastePlaceholder: 'Paste the JSON or YAML content of your OpenAPI document here…',
  importUploadLabel: 'Choose a file',
  importUrlLabel: 'Document URL',
  importUrlPlaceholder: 'https://api.example.com/openapi.json',
  importSubmit: 'Import',
  importSubmitting: 'Importing…',
  importProjectNameLabel: 'Project name',
  importProjectNamePlaceholder: 'Leave blank to use the document title',
  importCreateSubmit: 'Continue',
  importCreateSubmitting: 'Creating project…',
  importSuccessHeading: 'Imported successfully',
  importSuccessOperationCount: (count: number) => `${count} operation${count === 1 ? '' : 's'} found`,

  validationTitle: 'Validation',
  validationSubtitle: 'Findings from the imported document.',
  validationNoDiagnostics: 'No validation findings — the document imported cleanly.',
  validationSourceHeading: 'Source document',
  validationContinue: 'Continue to readiness',

  severityError: 'Error',
  severityWarning: 'Warning',
  severityRecommendation: 'Recommendation',
  severityInfo: 'Info',

  readinessSubtitle: 'How ready this API is for an AI agent to use effectively — advisory, not a gate.',
  readinessRunAnalysis: 'Run analysis',
  readinessRunning: 'Analyzing…',
  readinessReanalyze: 'Re-analyze',
  readinessOverallScoreLabel: 'Overall readiness score',
  readinessOutOf: (score: number) => `${score} out of 100`,
  readinessCategoryScoresHeading: 'Score by category',
  readinessFindingsHeading: 'Findings',
  readinessNoFindings: 'No findings — nothing to improve here.',
  readinessFindingCount: (count: number) => `${count} finding${count === 1 ? '' : 's'}`,
  readinessContinue: 'Continue to API defaults',

  readinessSeverityInfo: 'Info',
  readinessSeverityWarning: 'Warning',
  readinessSeverityHigh: 'High',
  readinessSeverityCritical: 'Critical',

  readinessCategoryDiscoverability: 'Discoverability',
  readinessCategorySemanticClarity: 'Semantic Clarity',
  readinessCategorySchemaUsability: 'Schema Usability',
  readinessCategoryToolSetQuality: 'Tool Set Quality',
  readinessCategorySafety: 'Safety',
  readinessCategoryAuthenticationReadiness: 'Authentication Readiness',
  readinessCategoryRuntimeCompleteness: 'Runtime Completeness',
  readinessCategoryResponseQuality: 'Response Quality',

  stepImport: 'Import',
  stepValidation: 'Validation',
  stepReadiness: 'Agent Readiness',
  stepApi: 'API Defaults',
  stepAuth: 'Authentication',
  stepTools: 'Tools',
  stepBindings: 'Parameter Binding',
  stepPolicy: 'Safety',
  stepPlayground: 'Test',
  stepGenerate: 'Generate',

  errorGenericTitle: 'Something went wrong',
  errorDismiss: 'Dismiss',
};
