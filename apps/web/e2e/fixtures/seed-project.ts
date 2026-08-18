import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const CUSTOMER_SPEC = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');

/**
 * Creates a project with one enabled, fully-bound tool and a resolvable base URL — the
 * "everything reachable" state every wizard step renders real content for — via the real
 * API (not clicking through the UI), so a11y/keyboard specs can scan/traverse every step
 * without re-deriving the happy-path click sequence `wizard-happy-path.spec.ts` already covers.
 */
export async function seedReadyProject(request: APIRequestContext, name: string): Promise<string> {
  const importResp = await request.post('/api/import', { data: { kind: 'paste', text: CUSTOMER_SPEC } });
  const importBody = await importResp.json();
  const importId = importBody.data.importId as string;

  const projectResp = await request.post('/api/projects', { data: { importId, name } });
  const projectBody = await projectResp.json();
  const projectId = projectBody.data.id as string;
  const revision = projectBody.data.configRevision as number;
  const config = projectBody.data.config as { tools: Record<string, { enabled: boolean }>; api: { baseUrl: unknown } };

  const toolId = Object.keys(config.tools)[0]!;
  config.tools[toolId]!.enabled = true;
  config.api.baseUrl = { source: 'static', value: 'https://api.example.com' };

  await request.put(`/api/projects/${projectId}/config`, { data: { expectedRevision: revision, config } });

  return projectId;
}
