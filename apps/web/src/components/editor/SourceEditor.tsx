'use client';

import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

/**
 * Read-only source view. Monaco requires `ssr: false` — it touches `window`
 * at import time and errors if loaded from a Server Component (see R3 in
 * the implementation plan); this file exists solely to be the client-only
 * boundary, not imported anywhere but `/validation`.
 */
export function SourceEditor({
  value,
  language,
  highlightLine,
  ariaLabel,
}: {
  value: string;
  language: 'json' | 'yaml';
  highlightLine?: number | undefined;
  ariaLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10" role="group" aria-label={ariaLabel}>
      <MonacoEditor
        height="min(480px, 60vh)"
        language={language}
        value={value}
        theme="light"
        {...(highlightLine !== undefined ? { line: highlightLine } : {})}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          accessibilitySupport: 'on',
        }}
      />
    </div>
  );
}
