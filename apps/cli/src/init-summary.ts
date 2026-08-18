import type { ConfigEnvBinding } from '@mcpgen/upstream-auth';
import type { RiskClassification } from '@mcpgen/risk-engine';
import type { SeedAuthUnsupportedReason, SkippedScheme } from '@mcpgen/config-seed';

export type InitAuthOutcome =
  | { readonly kind: 'seeded'; readonly type: string; readonly schemeName: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unsupported'; readonly schemeName: string; readonly reason: SeedAuthUnsupportedReason; readonly suggestion: string };

export interface InitSummary {
  readonly outPath: string;
  readonly projectName: string;
  readonly slug: string;
  readonly specPath: string;
  readonly declaredVersion: string;
  readonly operationCount: number;
  readonly auth: InitAuthOutcome;
  readonly skippedSchemes: readonly SkippedScheme[];
  readonly toolsDiscovered: number;
  readonly toolsEnabled: number;
  readonly toolsByRisk: Readonly<Record<RiskClassification, number>>;
  readonly unmatchedEnableNames: readonly string[];
  readonly envVars: readonly ConfigEnvBinding[];
}

const AUTH_UNSUPPORTED_SUGGESTIONS: Readonly<Record<SeedAuthUnsupportedReason, string>> = {
  'apikey-cookie': 'Cookie-based API keys are not supported yet. Add an upstreamAuthentication block by hand once you know how the value should be supplied.',
  'oauth2-flow-unsupported': 'The document does not declare a client_credentials flow with a tokenUrl. Add an upstreamAuthentication block by hand — see the oauth2ClientCredentials example in README.md.',
  'openid-connect': 'openIdConnect is not supported. Configure upstreamAuthentication by hand once you know the real token endpoint.',
};

export function suggestionFor(reason: SeedAuthUnsupportedReason): string {
  return AUTH_UNSUPPORTED_SUGGESTIONS[reason];
}

/** Human-readable, printed to stdout. `renderInitJson` is the --json counterpart. */
export function renderInitSummary(summary: InitSummary): string {
  const lines: string[] = [];
  lines.push(`Wrote ${summary.outPath}`, '');
  lines.push(`  Project   ${summary.projectName}  (slug: ${summary.slug})`);
  lines.push(`  Source    ${summary.specPath}  (${summary.declaredVersion}, ${summary.operationCount} operation${summary.operationCount === 1 ? '' : 's'})`);

  if (summary.auth.kind === 'seeded') {
    lines.push(`  Auth      ${summary.auth.type}  ← security scheme "${summary.auth.schemeName}"`);
  } else if (summary.auth.kind === 'unsupported') {
    lines.push(`  Auth      none written — "${summary.auth.schemeName}" could not be seeded (see warning below)`);
  } else {
    lines.push('  Auth      none — the document declares no security scheme');
  }

  const riskParts = (Object.entries(summary.toolsByRisk) as [RiskClassification, number][])
    .filter(([, count]) => count > 0)
    .map(([risk, count]) => `${count} ${risk}`)
    .join(' · ');
  lines.push(`  Tools     ${summary.toolsDiscovered} discovered · ${summary.toolsEnabled} enabled${riskParts ? `   (${riskParts})` : ''}`, '');

  if (summary.envVars.length > 0) {
    lines.push('Environment variables this config requires at run time:');
    const nameWidth = Math.max(...summary.envVars.map((v) => v.name.length));
    for (const v of summary.envVars) {
      lines.push(`  ${v.name.padEnd(nameWidth)}   ${v.usedByBaseUrl ? 'base URL' : v.sensitive ? 'secret  ' : 'config  '}   ${v.required ? 'required' : 'optional'}`);
    }
    lines.push('');
  }

  lines.push('Next:');
  if (summary.toolsEnabled === 0) {
    lines.push(`  mcpgen init --spec ${summary.specPath} --enable-read-only --force`);
  }
  lines.push(`  mcpgen validate --config ${summary.outPath} --spec ${summary.specPath}`);
  lines.push(`  mcpgen generate --config ${summary.outPath} --spec ${summary.specPath} --out ./my-mcp`);

  return lines.join('\n');
}

export interface InitWarning {
  readonly message: string;
}

/** Printed to stderr regardless of --json, so stdout stays pure JSON when --json is set. */
export function collectInitWarnings(summary: InitSummary): readonly InitWarning[] {
  const warnings: InitWarning[] = [];

  if (summary.auth.kind === 'unsupported') {
    warnings.push({ message: `Authentication scheme "${summary.auth.schemeName}" was not seeded: ${summary.auth.suggestion}` });
  }
  if (summary.skippedSchemes.length > 0) {
    warnings.push({
      message: `The document declares ${summary.skippedSchemes.length + (summary.auth.kind === 'none' ? 0 : 1)} security schemes; only one was used. Not used: ${summary.skippedSchemes.map((s) => s.name).join(', ')}.`,
    });
  }
  if (summary.unmatchedEnableNames.length > 0) {
    warnings.push({ message: `--enable name(s) not found among discovered tools: ${summary.unmatchedEnableNames.join(', ')}` });
  }
  if (summary.toolsEnabled === 0) {
    warnings.push({ message: 'No tools are enabled. This config will start a server with an empty tool surface — pass --enable-read-only or --enable <name> to turn some on.' });
  }

  return warnings;
}

export function renderInitJson(summary: InitSummary, warnings: readonly InitWarning[]): string {
  return `${JSON.stringify({ ...summary, warnings: warnings.map((w) => w.message) }, null, 2)}\n`;
}
