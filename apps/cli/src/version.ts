/**
 * `__MCPGEN_VERSION__` is injected at build time by the npm-packaging esbuild bundle (a later
 * phase) via `define`. It is never declared as a real variable, so this stays safe to run
 * un-bundled today (under plain `tsc` output, `typeof` on an undeclared identifier returns
 * `'undefined'` rather than throwing) — deliberately not `readFileSync('../package.json')`,
 * which is fragile once the CLI ships as a single bundled file with no package.json alongside it.
 */
declare global {
  const __MCPGEN_VERSION__: string | undefined;
}

export const CLI_VERSION: string = typeof __MCPGEN_VERSION__ === 'string' ? __MCPGEN_VERSION__ : '0.0.0-dev';
