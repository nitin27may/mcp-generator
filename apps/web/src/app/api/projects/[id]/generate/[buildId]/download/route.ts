import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { fail } from '@/server/http';
import { buildDir } from '@/server/paths';
import { readProjectRecord } from '@/server/project-store';
import { walkFiles } from '@/server/generate';

/** Additive beyond the original route inventory (TIP §51/§53) — a build's download link is only meaningful after `POST /generate` has produced one. 404 once the build's TTL sweep has removed it. */
export async function GET(_request: Request, ctx: RouteContext<'/api/projects/[id]/generate/[buildId]/download'>): Promise<Response> {
  const { id, buildId } = await ctx.params;

  const [record, dir] = await Promise.all([readProjectRecord(id), Promise.resolve(buildDir(id, buildId))]);
  if (!record) return fail([{ code: 'IMP-008', message: `No project "${id}"`, category: 'IMPORT' }], 404);

  try {
    await stat(dir);
  } catch {
    return fail([{ code: 'IMP-008', message: `Build "${buildId}" was not found — it may have expired`, category: 'IMPORT' }], 404);
  }

  const files = await walkFiles(dir);
  const zip = new ZipFile();
  for (const file of files) zip.addFile(join(dir, file.path), file.path);
  zip.end();

  const filename = `${record.name.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${buildId.slice(0, 8)}.zip`;

  // `ZipFile.outputStream` is a real `Readable` at runtime; `@types/yazl` just types it against
  // the looser `NodeJS.ReadableStream` interface, which `Readable.toWeb` doesn't accept directly.
  return new Response(Readable.toWeb(zip.outputStream as Readable) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
