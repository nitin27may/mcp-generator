import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiFail, ApiOk, ProjectAnalysis, ProjectSnapshot } from '@mcpgen/control-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as postAnalyze } from '../../src/app/api/projects/[id]/analyze/route.js';
import { POST as postImport } from '../../src/app/api/import/route.js';
import { GET as getProject } from '../../src/app/api/projects/[id]/route.js';
import { POST as postProjects } from '../../src/app/api/projects/route.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'mcpgen-web-it-'));
  process.env.MCPGEN_WORKSPACE_ROOT = workspaceRoot;
});

afterEach(async () => {
  delete process.env.MCPGEN_WORKSPACE_ROOT;
  await rm(workspaceRoot, { recursive: true, force: true });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/**
 * Calls the real Next.js Route Handler functions directly against real
 * @mcpgen/* packages and a real temp-directory disk store — zero mocks,
 * matching the repo's established testing philosophy. Doesn't spin up an
 * actual HTTP server (Next.js's own routing layer is not under test here),
 * but every byte of business logic in the request path is real.
 */
describe('project lifecycle — import -> create project -> get project (no mocks)', () => {
  it('imports a real spec, promotes it to a project, and the project is readable afterward', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');

    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    expect(importResponse.status).toBe(200);
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string; operationCount: number; format: string }>;
    expect(importBody.data.operationCount).toBe(3);
    expect(importBody.data.format).toBe('json');

    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId, name: 'Customer API' }));
    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(createBody.data.name).toBe('Customer API');
    expect(createBody.data.configRevision).toBe(1);
    expect(Object.keys(createBody.data.config.tools)).toHaveLength(3);
    expect(createBody.data.gates.tools.complete).toBe(false); // seeded with everything disabled

    const getResponse = await getProject(new Request(`http://localhost/api/projects/${createBody.data.id}`), {
      params: Promise.resolve({ id: createBody.data.id }),
    });
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(getBody.data.id).toBe(createBody.data.id);
    expect(getBody.data.api.operationCount).toBe(3);
    expect(getBody.data.gates.validation.complete).toBe(true);
  });

  it('rejects an unparseable spec without creating a staging entry', async () => {
    const response = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: '{ not valid json or yaml [[[' }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiFail;
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('404s when creating a project from an unknown or expired importId', async () => {
    const response = await postProjects(jsonRequest('http://localhost/api/projects', { importId: '00000000-0000-4000-8000-000000000000' }));
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiFail;
    expect(body.errors[0]?.code).toBe('IMP-008');
  });

  it('404s when fetching an unknown project id', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await getProject(new Request(`http://localhost/api/projects/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
  });

  it('400s on a structurally invalid project id (path-traversal defense)', async () => {
    const id = '../../etc/passwd';
    const response = await getProject(new Request(`http://localhost/api/projects/${encodeURIComponent(id)}`), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(400);
  });

  it('analyzes readiness for a real project, caches on disk, and skips recompute unless forced', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const firstAnalyze = await postAnalyze(jsonRequest(`http://localhost/api/projects/${projectId}/analyze`, {}), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(firstAnalyze.status).toBe(200);
    const firstBody = (await firstAnalyze.json()) as ApiOk<ProjectAnalysis>;
    expect(firstBody.data.readiness.categoryScores).toHaveLength(8);
    expect(firstBody.data.risk).toBeDefined();

    const cached = await postAnalyze(jsonRequest(`http://localhost/api/projects/${projectId}/analyze`, {}), {
      params: Promise.resolve({ id: projectId }),
    });
    const cachedBody = (await cached.json()) as ApiOk<ProjectAnalysis>;
    expect(cachedBody.data.analyzedAt).toBe(firstBody.data.analyzedAt); // skipped recompute — fingerprint matched

    await new Promise((resolve) => setTimeout(resolve, 5)); // guarantee a distinct `analyzedAt` millisecond for the forced recompute below
    const forced = await postAnalyze(jsonRequest(`http://localhost/api/projects/${projectId}/analyze`, { force: true }), {
      params: Promise.resolve({ id: projectId }),
    });
    const forcedBody = (await forced.json()) as ApiOk<ProjectAnalysis>;
    expect(forcedBody.data.analyzedAt).not.toBe(firstBody.data.analyzedAt);

    const withAnalysis = await getProject(new Request(`http://localhost/api/projects/${projectId}?include=analysis`), {
      params: Promise.resolve({ id: projectId }),
    });
    const withAnalysisBody = (await withAnalysis.json()) as ApiOk<ProjectSnapshot>;
    expect(withAnalysisBody.data.analysis?.readiness.overallScore).toBe(firstBody.data.readiness.overallScore);

    const withoutInclude = await getProject(new Request(`http://localhost/api/projects/${projectId}`), { params: Promise.resolve({ id: projectId }) });
    const withoutIncludeBody = (await withoutInclude.json()) as ApiOk<ProjectSnapshot>;
    expect(withoutIncludeBody.data.analysis).toBeUndefined();
  });

  it('404s when analyzing an unknown project id', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await postAnalyze(jsonRequest(`http://localhost/api/projects/${id}/analyze`, {}), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
  });
});
