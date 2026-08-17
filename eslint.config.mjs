import js from '@eslint/js';
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
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.snap',
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
);
