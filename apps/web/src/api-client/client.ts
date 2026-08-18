import type { ApiFail, ApiOk, ProductError } from '@mcpgen/control-contracts';

/** Thrown for a `4xx/5xx` response — carries the real `ProductError[]` so callers can render them, not just a generic message. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ProductError[],
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
    throw new ApiRequestError(response.status, (body as ApiFail).errors ?? []);
  }
  return body as ApiOk<T>;
}

export function apiGet<T>(path: string): Promise<ApiOk<T>> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiOk<T>> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
