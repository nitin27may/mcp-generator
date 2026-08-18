import type { GeneratedFile } from '@mcpgen/control-contracts';

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Read-only. Sorted for a stable, scannable listing — the server doesn't guarantee directory-walk order. */
export function FileManifest({ files }: { files: readonly GeneratedFile[] }) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <ul className="flex flex-col gap-0.5 font-mono text-xs">
      {sorted.map((file) => (
        <li key={file.path} className="flex justify-between gap-4">
          <span>{file.path}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  );
}
