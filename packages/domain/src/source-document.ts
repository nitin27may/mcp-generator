/** TIP §6.1 — the imported document, kept immutable and separate from the canonical model. */
export type SourceDocumentFormat = 'json' | 'yaml';

export type SourceDocumentOrigin =
  | { readonly type: 'upload'; readonly fileName: string }
  | { readonly type: 'paste' }
  | { readonly type: 'url'; readonly url: string };

export interface SourceDocument {
  readonly id: string;
  readonly format: SourceDocumentFormat;
  readonly declaredVersion: string;
  readonly rawFingerprint: string;
  readonly importedAt: string;
  readonly source: SourceDocumentOrigin;
}

/** What a `CanonicalApi` carries forward — not the whole document, just its identity. */
export interface SourceDocumentRef {
  readonly id: string;
  readonly rawFingerprint: string;
}
