/** TIP §9.1. */
export interface FetchPolicy {
  readonly allowedSchemes: readonly ('https' | 'http')[];
  readonly allowPrivateNetworks: boolean;
  readonly maxRedirects: number;
  readonly maxDocumentBytes: number;
  readonly maxTotalBytes: number;
  /**
   * Caps `bundle()`'s own JSON node-traversal depth (protects against
   * pathologically deep document *structure*, e.g. a deliberately
   * nesting-bombed schema) — NOT a cap on chained $ref-to-$ref hops, despite
   * the name matching TIP §9.1's field. Verified empirically: a low value
   * (originally 8, matching the field's apparent intent) silently stopped
   * `bundle()` from resolving a perfectly ordinary, non-malicious $ref
   * nested under `paths./x.get.responses.200.content...schema.properties` —
   * ~9 levels deep, which is unremarkable for a real OpenAPI document.
   * `maxReferences` is the actual protection against reference-chain abuse
   * (a large *number* of remote fetches); this field only needs to be large
   * enough that real documents never hit it.
   */
  readonly maxReferenceDepth: number;
  readonly maxReferences: number;
  readonly timeoutMs: number;
}

/** HTTPS only by default — TIP §9.2 blocks `file://`/`ftp://`/`gopher://` and non-TLS by default. */
export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  allowedSchemes: ['https'],
  allowPrivateNetworks: false,
  maxRedirects: 5,
  maxDocumentBytes: 5_000_000,
  maxTotalBytes: 20_000_000,
  maxReferenceDepth: 100,
  maxReferences: 50,
  timeoutMs: 10_000,
};
