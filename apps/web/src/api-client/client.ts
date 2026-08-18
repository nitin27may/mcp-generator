import type { ApiFail, ApiOk, ProductError } from '@mcpgen/control-contracts';

/** Thrown for a `4xx/5xx` response — carries the real `ProductError[]` so callers can render them, not just a generic message. `serverRevision` is set only for the `PUT /config` 409 conflict shape (TIP §51 D2). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ProductError[],
    readonly serverRevision?: number,
  ) {
    super(errors[0]?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiOk<T>> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    const failBody = body as ApiFail & { serverRevision?: number };
    throw new ApiRequestError(response.status, failBody.errors ?? [], failBody.serverRevision);
  }
  return body as ApiOk<T>;
}

export function apiGet<T>(path: string): Promise<ApiOk<T>> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiOk<T>> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown, init?: RequestInit): Promise<ApiOk<T>> {
  return request<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) });
}
