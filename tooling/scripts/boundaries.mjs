#!/usr/bin/env node
/**
 * Package dependency boundary check — TIP §91, enforcing ADR-0003/0004/0005/0007/0009.
 *
 * A rule with no enforcement is a comment. This script is that enforcement: it runs in
 * the `lint` CI job and is a blocking gate per TIP §49.
 *
 * Checks both declared dependencies (package.json) and actual imports (source text),
 * because a transitive import bypasses a manifest check and a phantom dependency
 * bypasses an import check.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `--root <dir>` lets the regression test point the checker at fixture workspaces,
// so the gate itself is proven to fail when it should. An untested gate is decoration.
const rootArgIndex = process.argv.indexOf('--root');
const ROOT =
  rootArgIndex !== -1 && process.argv[rootArgIndex + 1]
    ? resolve(process.argv[rootArgIndex + 1])
    : fileURLToPath(new URL('../..', import.meta.url));
const QUIET = process.argv.includes('--quiet');

/** @type {{id: string, description: string, adr?: string}[]} */
const RULES = [
  { id: 'domain-pure', description: '`domain` has zero runtime dependencies' },
  { id: 'parser-confined', description: 'only `openapi-adapter` may use @scalar/*', adr: 'ADR-0003' },
  { id: 'sdk-confined', description: 'only `mcp-protocol` may use @modelcontextprotocol/*', adr: 'ADR-0004' },
  { id: 'analysis-pure', description: '`readiness-engine`/`risk-engine` must not use the SDK, parser, or UI', adr: 'ADR-0007' },
  { id: 'contracts-pure', description: '`control-contracts` must not use react/next/UI — shared by apps/web today, may gain another consumer later' },
  { id: 'auth-planes-separate', description: '`upstream-auth` must not import `mcp-protocol`', adr: 'ADR-0005' },
  { id: 'apps-are-leaves', description: 'no package may import from `apps/*`' },
  { id: 'modern-era-only', description: 'no `McpServer#connect()` — it silently serves the legacy protocol era', adr: 'ADR-0009' },
];

const SDK_SCOPE = '@modelcontextprotocol/';
const PARSER_SCOPE = '@scalar/';
const UI_PACKAGES = ['react', 'next', '@tanstack/react-query'];

/** Packages allowed to depend on the SDK, by workspace name suffix. */
const SDK_ALLOWED = new Set(['mcp-protocol']);
const PARSER_ALLOWED = new Set(['openapi-adapter']);

const violations = [];
const checked = { packages: 0, files: 0 };

function listWorkspacePackages() {
  const out = [];
  for (const group of ['packages', 'apps']) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const pkgPath = join(dir, name, 'package.json');
      if (!existsSync(pkgPath)) continue;
      out.push({
        shortName: name,
        group,
        dir: join(dir, name),
        manifest: JSON.parse(readFileSync(pkgPath, 'utf8')),
      });
    }
  }
  return out;
}

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue;
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(entry)) out.push(p);
    }
  };
  walk(join(dir, 'src'));
  walk(join(dir, 'test'));
  return out;
}

/** Extract module specifiers from import/export/require/dynamic-import forms. */
function importsOf(text) {
  const specs = new Set();
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

function fail(rule, pkg, detail, file) {
  violations.push({ rule, pkg, detail, file: file ? relative(ROOT, file) : undefined });
}

for (const pkg of listWorkspacePackages()) {
  checked.packages++;
  const { shortName, manifest, dir, group } = pkg;
  const deps = { ...(manifest.dependencies ?? {}) };
  const allDeclared = { ...deps, ...(manifest.devDependencies ?? {}) };
  const isTestOnlySdkUse = shortName === 'test-fixtures';

  // --- manifest-level checks -------------------------------------------------
  if (shortName === 'domain' && Object.keys(deps).length > 0) {
    fail('domain-pure', shortName, `declares dependencies: ${Object.keys(deps).join(', ')}`);
  }

  for (const dep of Object.keys(deps)) {
    if (dep.startsWith(SDK_SCOPE) && !SDK_ALLOWED.has(shortName) && !isTestOnlySdkUse) {
      fail('sdk-confined', shortName, `declares runtime dependency ${dep}`);
    }
    if (dep.startsWith(PARSER_SCOPE) && !PARSER_ALLOWED.has(shortName)) {
      fail('parser-confined', shortName, `declares runtime dependency ${dep}`);
    }
  }

  if (shortName === 'upstream-auth' && Object.keys(allDeclared).some((d) => d.endsWith('mcp-protocol'))) {
    fail('auth-planes-separate', shortName, 'declares a dependency on mcp-protocol');
  }

  if ((shortName === 'readiness-engine' || shortName === 'risk-engine')) {
    for (const dep of Object.keys(allDeclared)) {
      if (dep.startsWith(SDK_SCOPE) || dep.startsWith(PARSER_SCOPE) || UI_PACKAGES.includes(dep)) {
        fail('analysis-pure', shortName, `declares ${dep}`);
      }
    }
  }

  if (shortName === 'control-contracts') {
    for (const dep of Object.keys(allDeclared)) {
      if (UI_PACKAGES.includes(dep)) fail('contracts-pure', shortName, `declares ${dep}`);
    }
  }

  // --- source-level checks ---------------------------------------------------
  for (const file of sourceFiles(dir)) {
    checked.files++;
    const text = readFileSync(file, 'utf8');
    const isLegacyFixture = /@boundaries-allow\s+modern-era-only/.test(text);
    // Test files never ship in `dist/`, so a devDependency import (vitest, a
    // mock, a test-only client) is not a domain-purity violation — only
    // production source under domain-pure's zero-dependency invariant.
    const isTestFile = /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

    for (const spec of importsOf(text)) {
      if (spec.startsWith(SDK_SCOPE) && !SDK_ALLOWED.has(shortName) && !isTestOnlySdkUse) {
        fail('sdk-confined', shortName, `imports ${spec}`, file);
      }
      if (spec.startsWith(PARSER_SCOPE) && !PARSER_ALLOWED.has(shortName)) {
        fail('parser-confined', shortName, `imports ${spec}`, file);
      }
      if (shortName === 'domain' && !isTestFile && !spec.startsWith('.') && !spec.startsWith('node:')) {
        fail('domain-pure', shortName, `imports ${spec}`, file);
      }
      if (shortName === 'upstream-auth' && spec.includes('mcp-protocol')) {
        fail('auth-planes-separate', shortName, `imports ${spec}`, file);
      }
      if ((shortName === 'readiness-engine' || shortName === 'risk-engine')
          && (spec.startsWith(SDK_SCOPE) || spec.startsWith(PARSER_SCOPE) || UI_PACKAGES.includes(spec))) {
        fail('analysis-pure', shortName, `imports ${spec}`, file);
      }
      if (shortName === 'control-contracts' && UI_PACKAGES.includes(spec)) {
        fail('contracts-pure', shortName, `imports ${spec}`, file);
      }
      if (group === 'packages' && /(^|\/)apps\//.test(spec)) {
        fail('apps-are-leaves', shortName, `imports ${spec}`, file);
      }
    }

    // ADR-0009: `.connect(` on an McpServer silently selects the LEGACY protocol era.
    // The modern 2026-07-28 path is serveStdio(factory). Opt out only in fixtures that
    // deliberately exercise the legacy era, with an explicit marker comment.
    if (!isLegacyFixture && /\.connect\s*\(\s*new\s+Stdio(Server)?Transport/.test(text)) {
      fail('modern-era-only', shortName,
        'uses McpServer#connect(new StdioServerTransport()) — serves protocol 2025-11-25, not 2026-07-28. Use serveStdio(factory).',
        file);
    }
  }
}

const width = Math.max(...RULES.map((r) => r.id.length));
if (violations.length === 0) {
  if (!QUIET) {
    console.log(`boundaries: OK — ${checked.packages} package(s), ${checked.files} file(s)`);
    for (const r of RULES) {
      console.log(`  ✓ ${r.id.padEnd(width)}  ${r.description}${r.adr ? `  [${r.adr}]` : ''}`);
    }
  }
  process.exit(0);
}

console.error(`boundaries: ${violations.length} violation(s)\n`);
for (const v of violations) {
  const rule = RULES.find((r) => r.id === v.rule);
  console.error(`  [${v.rule}]${rule?.adr ? ` ${rule.adr}` : ''}`);
  console.error(`    package: ${v.pkg}`);
  console.error(`    problem: ${v.detail}`);
  if (v.file) console.error(`    file:    ${v.file}`);
  console.error('');
}
process.exit(1);
