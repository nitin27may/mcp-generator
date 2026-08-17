import { bundle } from '@scalar/json-magic/bundle';
import { fetchUrls } from '@scalar/json-magic/bundle/plugins/node';
import type { Diagnostic } from '@mcpgen/domain';
import { DEFAULT_FETCH_POLICY, type FetchPolicy } from './fetch-policy.js';
import { BlockedFetchError, createSafeFetch } from './safe-fetch.js';

function blockedRefDiagnostic(ref: string, error: BlockedFetchError): Diagnostic {
  return { severity: 'error', code: error.code, message: `Blocked remote $ref "${ref}": ${error.message}` };
}

function unresolvedRefDiagnostic(ref: string): Diagnostic {
  return { severity: 'warning', code: 'VAL-001', message: `Could not resolve remote $ref "${ref}"` };
}

/**
 * TIP §9: resolves external (`https://...`) `$ref`s into the document ahead
 * of `dereference()`, which only ever walks *local* references — it never
 * fetches anything itself. `bundle()` (`@scalar/json-magic`, the successor to
 * the deprecated `load()`) embeds fetched content under `x-ext` and rewrites
 * the original `$ref`s to point there, so the existing local-only
 * `dereference()` call resolves them same as any internal ref — no separate
 * $ref-graph walker of our own.
 *
 * `fetchUrls()`'s own `limit` option only caps *concurrency*, not the total
 * fetch count, and it swallows every thrown error (including ours) into a
 * generic "fetch failed" — so `maxReferences` is enforced inside the wrapped
 * fetch itself, and policy-blocked refs are tracked in `blockedRefs` so
 * `onResolveError` (which only gets the failing node, not why) can be
 * cross-referenced back to produce an accurate diagnostic instead of a
 * generic "could not resolve".
 */
export async function resolveRemoteReferences(
  document: unknown,
  policy: FetchPolicy = DEFAULT_FETCH_POLICY,
): Promise<{ document: unknown; diagnostics: Diagnostic[] }> {
  const { fetch: safeFetch } = createSafeFetch(policy);
  const blockedRefs = new Map<string, BlockedFetchError>();
  let fetchCount = 0;

  const guardedFetch: typeof fetch = async (input, init) => {
    const key = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    fetchCount++;
    if (fetchCount > policy.maxReferences) {
      const error = new BlockedFetchError('SEC-IMP-004', `Exceeded maximum of ${policy.maxReferences} remote references`);
      blockedRefs.set(key, error);
      throw error;
    }
    try {
      return await safeFetch(input, init);
    } catch (error) {
      if (error instanceof BlockedFetchError) blockedRefs.set(key, error);
      throw error;
    }
  };

  const diagnostics: Diagnostic[] = [];

  const bundled = await bundle(document as Record<string, unknown>, {
    plugins: [fetchUrls({ fetch: guardedFetch })],
    depth: policy.maxReferenceDepth,
    treeShake: true,
    hooks: {
      onResolveError: (node: { $ref?: unknown }) => {
        const ref = String(node.$ref ?? '');
        const blocked = blockedRefs.get(ref);
        diagnostics.push(blocked ? blockedRefDiagnostic(ref, blocked) : unresolvedRefDiagnostic(ref));
      },
    },
  });

  return { document: bundled, diagnostics };
}
