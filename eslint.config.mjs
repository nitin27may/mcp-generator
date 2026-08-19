import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Runtime packages: anything whose code can run inside a served MCP process.
 * A stray console.* here corrupts the stdio protocol channel (BR-009, ADR-0009),
 * so `no-console` is an error rather than a style preference.
 */
const RUNTIME_PACKAGES = [
  'packages/mcp-runtime/**',
  'packages/mcp-protocol/**',
  'packages/upstream-http/**',
  'packages/upstream-auth/**',
  'packages/binding-engine/**',
  'packages/redaction/**',
  'packages/config-schema/**',
  'packages/schema-normalizer/**',
  'packages/domain/**',
  'apps/cli/**',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-npm/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.snap',
      '**/.next/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-coercion': 'error',
    },
  },

  // BR-009: stdout is protocol-only. Enforced, not merely documented.
  {
    files: RUNTIME_PACKAGES,
    rules: {
      'no-console': 'error',
    },
  },

  // ADR-0009: McpServer#connect() silently serves the legacy protocol era.
  // The `boundaries` script carries the authoritative check; this is the fast local signal.
  {
    files: ['packages/**', 'apps/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='connect'] > NewExpression[callee.name=/^Stdio(Server)?Transport$/]",
          message:
            'McpServer#connect() serves protocol 2025-11-25 (legacy era). Use serveStdio(factory) for 2026-07-28 — see ADR-0009.',
        },
      ],
    },
  },

  // Tests may log and may exercise legacy paths deliberately.
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', 'packages/test-fixtures/**'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['tooling/**/*.mjs', '*.mjs', '*.config.*'],
    rules: {
      'no-console': 'off',
    },
  },

  // apps/web: browser code, not a stdio protocol package — no-console/no-restricted-syntax
  // above still apply harmlessly (this isn't a runtime package, and the ADR-0009 connect()
  // selector never matches React code), this block only adds what apps/web additionally needs.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin, 'jsx-a11y': jsxA11y },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // The Next plugin defaults to looking for pages/src/pages relative to the ESLint root
      // (the monorepo root here, not apps/web) — point it at the real app directory.
      '@next/next/no-html-link-for-pages': ['error', 'apps/web/src/app'],
      // axe's `scrollable-region-focusable` requires a horizontally scrolling
      // container to be focusable, or a keyboard user cannot scroll it at all —
      // and the a11y suite fails the build over it. This rule's default allowlist
      // predates that and only permits `tabpanel`, so the two lint each other's
      // fixes. `region` is added because the axe check is the one grounded in real
      // assistive-technology behavior; anything focusable under it still needs an
      // accessible name, which `region` requires.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
    },
  },

  // Vendored shadcn/ui primitives: third-party source we copy in, not code we author to our own
  // strictness bar. `no-explicit-any` and `label-has-associated-control` are relaxed here because
  // these are generic wrapper components (e.g. Label spreads `...props`, including `htmlFor`, onto
  // a plain <label> — the rule can't see that statically) — real usage sites are NOT exempted, only
  // the wrapper definitions. `heading-has-content` is relaxed for the same reason: `CardTitle`
  // spreads `...props` (including `children`) onto a real `<h2>` — the static analyzer can't see
  // that the heading will have content, but every real call site passes one. The tsconfig itself
  // stays strict everywhere.
  {
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/heading-has-content': 'off',
    },
  },
);
