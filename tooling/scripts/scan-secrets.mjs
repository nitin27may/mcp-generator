#!/usr/bin/env node
/**
 * Secret-literal scan — ADR-0006 enforcement, run by the `security` CI job.
 *
 * The gate this replaces was a single inline `grep` applied uniformly to every file.
 * It could never pass: test suites legitimately need credential-shaped values to prove
 * that redaction, startup validation and the 401 paths actually work, and those values
 * tripped the same pattern a real leaked key would. A gate that cannot pass is not a
 * gate — it gets skipped, and this one had in fact never executed, because the vitest
 * step ahead of it always failed first.
 *
 * The rule is therefore split in two:
 *
 *   1. Production source, fixtures and docs may contain NO credential-shaped literal.
 *   2. Test files may, but only values that are recognisably fake — every one has to
 *      carry a sentinel marker. This keeps the intent ("no real credential ever lands
 *      in this repo") enforceable without pretending tests don't need test data.
 *
 * `--root <dir>` points the scanner at a fixture tree so the gate itself is testable.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArgIndex = process.argv.indexOf('--root');
const ROOT =
  rootArgIndex !== -1 && process.argv[rootArgIndex + 1]
    ? resolve(process.argv[rootArgIndex + 1])
    : fileURLToPath(new URL('../..', import.meta.url));
const QUIET = process.argv.includes('--quiet');

const SCAN_DIRS = ['packages', 'apps', 'fixtures', 'docs', 'examples'];
const SCAN_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|json|md)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-npm', '.next', '.turbo', '__snapshots__']);

/**
 * A credential-shaped assignment: an api-key/secret/token/password-ish name, then `:` or
 * `=`, then a quoted string of 8+ characters that isn't obviously an interpolation or a
 * placeholder expression. Deliberately the same shape the previous inline grep used, so
 * this is a refinement of that gate rather than a weakening of it.
 */
const SECRET_ASSIGNMENT =
  /(api[-_]?key|secret|token|password|passwd|credential)["']?\s*[:=]\s*(["'])([^"'<{$\n]{8,})\2/gi;

/**
 * Markers that make a value self-evidently fake. A test credential must carry one.
 * SCREAMING_SNAKE values are environment-variable *names*, not secrets, and are allowed
 * everywhere — `packages/config-seed` is full of them by design.
 */
const SENTINEL_MARKERS = [
  'sentinel',
  'e2e',
  'sk-',
  'placeholder',
  'example',
  'dummy',
  'fake',
  'test-',
  'not-a-',
  'redacted',
  'sandbox',
];
// Requires at least one underscore-separated segment. A bare run of capitals and digits
// is not distinguishable from a real credential — an AWS access key ID (AKIA...) matches
// the naive /^[A-Z][A-Z0-9_]*$/ exactly — whereas every env var this project derives is
// segmented: CUSTOMER_API_KEY, OAUTH_CLIENT_SECRET (see packages/config-seed/src/slug.ts).
const ENV_VAR_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

const isTestFile = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
const isFixturePackage = (path) => path.includes(`${join('packages', 'test-fixtures')}`);
/**
 * The OAuth sandbox ships a Keycloak realm, an admin password and a client secret. They are
 * local-only and disposable by construction, but they are still credential literals in a
 * repository that is about to become public — so they are scanned, and held to the same
 * sentinel requirement as test data rather than exempted.
 */
const isExample = (path) => path.split(sep)[0] === 'examples';

function isAcceptableSentinel(value) {
  const lower = value.toLowerCase();
  return SENTINEL_MARKERS.some((marker) => lower.includes(marker));
}

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d)) {
      if (SKIP_DIRS.has(entry)) continue;
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (SCAN_EXTENSIONS.test(entry)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const violations = [];
let filesChecked = 0;

for (const group of SCAN_DIRS) {
  for (const file of sourceFiles(join(ROOT, group))) {
    filesChecked++;
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    // Test data is allowed to look like a credential; production code never is.
    const allowSentinels = isTestFile(rel) || isFixturePackage(rel) || isExample(rel);

    SECRET_ASSIGNMENT.lastIndex = 0;
    let match;
    while ((match = SECRET_ASSIGNMENT.exec(text)) !== null) {
      const value = match[3];
      const line = text.slice(0, match.index).split('\n').length;
      // A SCREAMING_SNAKE value is the *name* of an environment variable, not its
      // contents — which is exactly what ADR-0006 requires configs to carry. Allowed
      // everywhere, production source included; packages/config-seed is built on it.
      if (ENV_VAR_NAME.test(value)) continue;
      if (!allowSentinels) {
        violations.push({ rel, line, value, why: 'credential-shaped literal outside a test file' });
      } else if (!isAcceptableSentinel(value)) {
        violations.push({
          rel,
          line,
          value,
          why: `test credential without a sentinel marker (one of: ${SENTINEL_MARKERS.join(', ')})`,
        });
      }
    }
  }
}

if (violations.length === 0) {
  if (!QUIET) console.log(`scan-secrets: OK — ${filesChecked} file(s), no credential literals`);
  process.exit(0);
}

for (const v of violations) {
  const shown = v.value.length > 24 ? `${v.value.slice(0, 24)}…` : v.value;
  console.error(`::error file=${v.rel},line=${v.line}::${v.why}: "${shown}"`);
}
console.error(`\nSecrets are references only — see ADR-0006 and docs/adr/0006-secrets-are-references-only.md.`);
console.error(`${violations.length} violation(s) across ${filesChecked} scanned file(s).`);
process.exit(1);
