import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `@mcpgen/generator`'s self-contained bundling step (bundle.ts) uses `esbuild`,
  // which ships a platform-specific native binary — Turbopack fails trying to trace
  // and inline that binary (and its README) into the route's own server bundle.
  // `esbuild` needs to stay a real, request-time `require()`, not something bundled.
  serverExternalPackages: ['esbuild'],
};

export default nextConfig;
