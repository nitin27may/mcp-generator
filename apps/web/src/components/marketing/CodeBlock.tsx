/**
 * Static, non-interactive shell snippets for `/docs`. Deliberately not Monaco —
 * the editor is a heavyweight client component earning its place on the import
 * step, and a public page should not pay for it to render four lines of bash.
 */
export function CodeBlock({ caption, code }: { caption: string; code: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{caption}</p>
      {/* A horizontally scrolling region has to be focusable, or a keyboard user
          cannot scroll it to read the rest of the command — which is exactly what
          happens to these snippets at 375px. Flagged by axe's
          `scrollable-region-focusable`; the label keeps it from being an
          anonymous tab stop once it is focusable. */}
      <pre
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="overflow-x-auto rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
