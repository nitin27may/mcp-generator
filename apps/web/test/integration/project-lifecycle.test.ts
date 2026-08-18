import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiFail, ApiOk, ProjectAnalysis, ProjectSnapshot } from '@mcpgen/control-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as postAnalyze } from '../../src/app/api/projects/[id]/analyze/route.js';
import { PUT as putConfig } from '../../src/app/api/projects/[id]/config/route.js';
import { POST as postDryRun } from '../../src/app/api/projects/[id]/playground/dry-run/route.js';
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

function jsonPutRequest(url: string, body: unknown): Request {
  return new Request(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

  it('round-trips a config edit through PUT /config, bumping configRevision', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const editedConfig = { ...createBody.data.config, project: { name: 'Renamed via PUT' } };
    const putResponse = await putConfig(
      jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: createBody.data.configRevision, config: editedConfig }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(putResponse.status).toBe(200);
    const putBody = (await putResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(putBody.data.config.project.name).toBe('Renamed via PUT');
    expect(putBody.data.configRevision).toBe(createBody.data.configRevision + 1);

    const refetched = await getProject(new Request(`http://localhost/api/projects/${projectId}`), { params: Promise.resolve({ id: projectId }) });
    const refetchedBody = (await refetched.json()) as ApiOk<ProjectSnapshot>;
    expect(refetchedBody.data.config.project.name).toBe('Renamed via PUT');
  });

  it('409s with the current serverRevision when expectedRevision is stale (two-tab conflict)', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    // Tab A saves first, advancing the server to revision 2.
    const tabAConfig = { ...createBody.data.config, project: { name: 'From tab A' } };
    await putConfig(jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: 1, config: tabAConfig }), {
      params: Promise.resolve({ id: projectId }),
    });

    // Tab B still thinks it's revision 1 — the server must refuse, not silently clobber tab A's save.
    const tabBConfig = { ...createBody.data.config, project: { name: 'From tab B' } };
    const tabBResponse = await putConfig(jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: 1, config: tabBConfig }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(tabBResponse.status).toBe(409);
    const tabBBody = (await tabBResponse.json()) as ApiFail & { serverRevision: number };
    expect(tabBBody.serverRevision).toBe(2);
    expect(tabBBody.errors[0]?.code).toBe('CFG-002');

    const stillTabA = await getProject(new Request(`http://localhost/api/projects/${projectId}`), { params: Promise.resolve({ id: projectId }) });
    const stillTabABody = (await stillTabA.json()) as ApiOk<ProjectSnapshot>;
    expect(stillTabABody.data.config.project.name).toBe('From tab A'); // tab B's write never landed
  });

  it('422s with a sourcePointer-carrying ProductError when the config fails schema validation', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const invalidConfig = { ...createBody.data.config, api: { baseUrl: { source: 'environment', name: 'not valid — lowercase and spaces' } } };
    const response = await putConfig(
      jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: createBody.data.configRevision, config: invalidConfig }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiFail;
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0]?.sourcePointer).toBe('#/api/baseUrl/name');
  });

  it('404s when saving config for an unknown project id', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await putConfig(jsonPutRequest(`http://localhost/api/projects/${id}/config`, { expectedRevision: 1, config: {} }), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
  });

  it('returns operation summaries and per-operation detail via ?include=operations,operationDetail&operationId=', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const operationsResponse = await getProject(new Request(`http://localhost/api/projects/${projectId}?include=operations`), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(operationsResponse.status).toBe(200);
    const operationsBody = (await operationsResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(operationsBody.data.operations).toHaveLength(3);
    expect(operationsBody.data.operationDetail).toBeUndefined();
    const firstOperationId = operationsBody.data.operations![0]!.id;

    const detailResponse = await getProject(
      new Request(`http://localhost/api/projects/${projectId}?include=operationDetail&operationId=${firstOperationId}`),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(detailBody.data.operationDetail?.id).toBe(firstOperationId);
    expect(detailBody.data.operations).toBeUndefined();
  });

  it('400s when operationDetail is requested without operationId', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await getProject(new Request(`http://localhost/api/projects/${id}?include=operationDetail`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
  });

  it('404s when operationDetail is requested for an operationId that does not exist on the project', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const response = await getProject(new Request(`http://localhost/api/projects/${projectId}?include=operationDetail&operationId=not-a-real-operation`), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(response.status).toBe(404);
  });

  it('removing a required binding flips gates.bindings.complete to false; restoring it flips back to true', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const getCustomerKey = Object.entries(createBody.data.config.tools).find(([, t]) => t.sourceOperation.operationId === 'getCustomer')![0];
    const originalBindings = createBody.data.config.tools[getCustomerKey]!.bindings;
    expect(originalBindings['customerId']).toBeDefined(); // seeded as tool-input by default

    const enabledConfig = { ...createBody.data.config, tools: { ...createBody.data.config.tools, [getCustomerKey]: { ...createBody.data.config.tools[getCustomerKey]!, enabled: true } } };
    const enableResponse = await putConfig(
      jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: createBody.data.configRevision, config: enabledConfig }),
      { params: Promise.resolve({ id: projectId }) },
    );
    const enableBody = (await enableResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(enableBody.data.gates.bindings.complete).toBe(true); // every required param still bound

    const { customerId: _removed, ...bindingsWithoutRequired } = originalBindings;
    const unboundConfig = {
      ...enableBody.data.config,
      tools: { ...enableBody.data.config.tools, [getCustomerKey]: { ...enableBody.data.config.tools[getCustomerKey]!, bindings: bindingsWithoutRequired } },
    };
    const unboundResponse = await putConfig(
      jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: enableBody.data.configRevision, config: unboundConfig }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(unboundResponse.status).toBe(200); // removing a binding is itself schema-valid — BND-001 is a gate concern, not a parse failure
    const unboundBody = (await unboundResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(unboundBody.data.gates.bindings.complete).toBe(false);

    const restoredConfig = {
      ...unboundBody.data.config,
      tools: { ...unboundBody.data.config.tools, [getCustomerKey]: { ...unboundBody.data.config.tools[getCustomerKey]!, bindings: originalBindings } },
    };
    const restoredResponse = await putConfig(
      jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: unboundBody.data.configRevision, config: restoredConfig }),
      { params: Promise.resolve({ id: projectId }) },
    );
    const restoredBody = (await restoredResponse.json()) as ApiOk<ProjectSnapshot>;
    expect(restoredBody.data.gates.bindings.complete).toBe(true);
  });

  it('round-trips a risk override to DESTRUCTIVE with retry.enabled: true — structurally legal even though the runtime refuses to honor it (BR-006)', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const getCustomerKey = Object.entries(createBody.data.config.tools).find(([, t]) => t.sourceOperation.operationId === 'getCustomer')![0];
    const tools = {
      ...createBody.data.config.tools,
      [getCustomerKey]: { ...createBody.data.config.tools[getCustomerKey]!, enabled: true, risk: 'DESTRUCTIVE' as const, retry: { enabled: true } },
    };
    const config = { ...createBody.data.config, tools };

    const response = await putConfig(jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: createBody.data.configRevision, config }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(response.status).toBe(200); // config-schema doesn't enforce the BR-006 floor — that's a runtime concern (upstream-http's isRetryEligible), not a config-validity concern
    const body = (await response.json()) as ApiOk<ProjectSnapshot>;
    expect(body.data.config.tools[getCustomerKey]).toMatchObject({ risk: 'DESTRUCTIVE', retry: { enabled: true } });
  });

  it('dry-runs a real enabled tool end to end and returns a request preview', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const getCustomerKey = Object.entries(createBody.data.config.tools).find(([, t]) => t.sourceOperation.operationId === 'getCustomer')![0];
    const tools = { ...createBody.data.config.tools, [getCustomerKey]: { ...createBody.data.config.tools[getCustomerKey]!, enabled: true } };
    const config = { ...createBody.data.config, tools };
    await putConfig(jsonPutRequest(`http://localhost/api/projects/${projectId}/config`, { expectedRevision: createBody.data.configRevision, config }), {
      params: Promise.resolve({ id: projectId }),
    });

    const toolName = config.tools[getCustomerKey]!.name;
    const response = await postDryRun(
      jsonRequest(`http://localhost/api/projects/${projectId}/playground/dry-run`, { toolName, input: { customer_id: 'cust_42' }, env: {} }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiOk<{ request: { method: string; path: string }; unresolvedVariables: string[] }>;
    expect(body.data.request.method).toBe('GET');
    expect(body.data.request.path).toBe('/customers/cust_42');
  });

  it('404s a dry-run against a tool name that is not enabled', async () => {
    const specText = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
    const importResponse = await postImport(jsonRequest('http://localhost/api/import', { kind: 'paste', text: specText }));
    const importBody = (await importResponse.json()) as ApiOk<{ importId: string }>;
    const createResponse = await postProjects(jsonRequest('http://localhost/api/projects', { importId: importBody.data.importId }));
    const createBody = (await createResponse.json()) as ApiOk<ProjectSnapshot>;
    const projectId = createBody.data.id;

    const response = await postDryRun(
      jsonRequest(`http://localhost/api/projects/${projectId}/playground/dry-run`, { toolName: 'not_a_real_tool', input: {}, env: {} }),
      { params: Promise.resolve({ id: projectId }) },
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiFail;
    expect(body.errors[0]?.code).toBe('MCP-001');
  });
});
